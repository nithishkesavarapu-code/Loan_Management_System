import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep, win32, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import type { Request, Response } from 'express';
import { fileTypeFromFile } from 'file-type';
import { salarySlipExtensions, salarySlipMaxBytes, type DocumentDTO } from '@lms/shared';
import { HttpError } from '../../middleware/errors.js';

const isVercel = !!process.env.VERCEL;
const projectRoot = isVercel ? '/var/task' : fileURLToPath(new URL('../../../../../', import.meta.url));
const webRoot = resolve(projectRoot, 'apps/web');
const keyPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.(?:pdf|jpg|png|upload)$/;
function contains(parent: string, child: string) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}
export function uploadDirectory(configured: string): string {
  const root = isAbsolute(configured) ? configured : resolve(projectRoot, configured);
  // On Vercel, /tmp is the only writable dir; skip the webRoot containment check
  if (!isVercel && (contains(webRoot, root) || contains(root, webRoot))) throw new Error('UPLOAD_DIR must be private and outside the web application.');
  return root;
}
export function safeOriginalName(value: string): string {
  return posix.basename(win32.basename(value)).replace(/[^\p{L}\p{N} ._()-]/gu, '_').replace(/^\.+/, '').trim().slice(-255) || 'salary-slip';
}
export const documentUnavailable = () => new HttpError(503, 'DOCUMENT_UNAVAILABLE', 'The document storage is unavailable. Please retry.');
export const invalidUpload = () => new HttpError(422, 'VALIDATION_FAILED', 'Provide exactly one nonempty file in the file field, with no other fields.');
const unsupported = () => new HttpError(415, 'UNSUPPORTED_FILE_TYPE', 'The file content, extension and MIME type must match PDF, JPG or PNG.');

export class DocumentStorage {
  readonly root: string;
  constructor(configured: string) { this.root = uploadDirectory(configured); }
  path(key: string): string {
    if (!keyPattern.test(key)) throw documentUnavailable();
    return resolve(this.root, key);
  }
  async prepare(): Promise<void> {
    try {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      const actual = await realpath(this.root);
      // On Vercel, /tmp may resolve via symlinks — only validate on local
      if (!isVercel) {
        uploadDirectory(actual);
        if (relative(this.root, actual) !== '') throw documentUnavailable();
      }
    } catch { throw documentUnavailable(); }
  }
  async remove(key: string): Promise<void> {
    try { await unlink(this.path(key)); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  }
  async receive(req: Request, res: Response): Promise<{ key: string; originalName: string; mimeType: DocumentDTO['mimeType']; sizeBytes: number }> {
    if (!req.is('multipart/form-data')) throw invalidUpload();
    await this.prepare();
    const temporaryKey = `${randomUUID()}.upload`;
    const options = {
      defParamCharset: 'utf8',
      storage: multer.diskStorage({ destination: (_req, _file, cb) => cb(null, this.root), filename: (_req, _file, cb) => cb(null, temporaryKey) }),
      limits: { fileSize: salarySlipMaxBytes, files: 1, fields: 0, parts: 1, fieldNameSize: 100 },
    };
    const parser = multer(options).single('file');
    try {
      await new Promise<void>((resolve, reject) => parser(req, res, (error: unknown) => error ? reject(error) : resolve()));
      const file = req.file;
      if (!file || file.size === 0) throw invalidUpload();
      if (file.size > salarySlipMaxBytes) throw new multer.MulterError('LIMIT_FILE_SIZE');
      let detected;
      try { detected = await fileTypeFromFile(this.path(temporaryKey)); }
      catch (error) {
        if (error instanceof Error && 'code' in error) throw documentUnavailable();
        throw unsupported();
      }
      const mimeType = detected?.mime as DocumentDTO['mimeType'] | undefined;
      const extensions = mimeType && salarySlipExtensions[mimeType];
      const extension = posix.extname(win32.basename(file.originalname)).toLowerCase();
      if (!mimeType || !extensions || file.mimetype !== mimeType || !extensions.includes(extension)) throw unsupported();
      const key = `${randomUUID()}${extensions[0]}`;
      try { await rename(this.path(temporaryKey), this.path(key)); }
      catch { throw documentUnavailable(); }
      return { key, originalName: safeOriginalName(file.originalname), mimeType, sizeBytes: file.size };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        throw new HttpError(413, 'FILE_TOO_LARGE', 'The maximum file size is 5,000,000 bytes.');
      }
      if (error instanceof Error && 'code' in error && !(error instanceof multer.MulterError)) throw documentUnavailable();
      throw invalidUpload();
    } finally {
      await this.remove(temporaryKey).catch(() => { console.error('Temporary document cleanup failed.'); });
    }
  }
  async open(key: string, sizeBytes: number) {
    try {
      const path = this.path(key);
      const entry = await lstat(path);
      if (!entry.isFile() || entry.isSymbolicLink()) throw documentUnavailable();
      const handle = await open(path, 'r');
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size !== sizeBytes) throw documentUnavailable();
        return handle;
      } catch (error) { await handle.close(); throw error; }
    } catch { throw documentUnavailable(); }
  }
}
