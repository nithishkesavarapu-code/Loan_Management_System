import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { DocumentStorage, safeOriginalName, uploadDirectory } from '../src/modules/documents/document.storage.js';

test('private storage resolves from the repository, not a process workspace, and rejects web paths', () => {
  assert.equal(uploadDirectory('storage/uploads'), resolve(import.meta.dirname, '../../..', 'storage/uploads'));
  for (const path of ['apps/web/public/uploads', 'apps/web/.next/static', '.', 'apps/web']) assert.throws(() => uploadDirectory(path));
  const storage = new DocumentStorage('storage/uploads');
  for (const key of ['../secret.pdf', 'C:\\secret.pdf', 'original-name.pdf', '00000000-0000-0000-0000-000000000000.exe']) assert.throws(() => storage.path(key));
  assert.equal(storage.path('00000000-0000-0000-0000-000000000000.pdf'), resolve(storage.root, '00000000-0000-0000-0000-000000000000.pdf'));
});
test('download names cannot carry paths, control characters, quotes or excessive length', () => {
  assert.equal(safeOriginalName('../../salary.pdf'), 'salary.pdf');
  assert.equal(safeOriginalName('C:\\private\\salary.pdf'), 'salary.pdf');
  assert.equal(safeOriginalName('salary\r\n".pdf'), 'salary___.pdf');
  assert.equal(safeOriginalName('..'), 'salary-slip');
  assert.ok(safeOriginalName('a'.repeat(300) + '.pdf').length <= 255);
});
