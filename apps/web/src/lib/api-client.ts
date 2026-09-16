import type { z } from 'zod';
import type { ApiError, DocumentDTO } from '@lms/shared';

export class ApiClientError extends Error {
  constructor(public readonly status: number, message: string, public readonly fields: Record<string, string[]> = {}, public readonly code = '', public readonly meta?: ApiError['error']['meta']) { super(message); }
}
type RequestOptions = { method?: 'GET' | 'POST' | 'PATCH'; data?: unknown; formData?: FormData };
async function apiResponse(path: string, options: RequestOptions = {}) {
  const method = options.method ?? 'GET';
  const response = await fetch(`/api/v1${path}`, {
    method, cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(options.formData ? 60000 : 15000),
    headers: method === 'GET' ? {} : { 'X-LMS-Request': '1', ...(options.data !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(options.formData ? { body: options.formData } : options.data !== undefined ? { body: JSON.stringify(options.data) } : {}),
  });
  if (response.status === 401) window.location.replace('/login?reason=session-expired');
  if (response.status === 403) window.location.replace('/access-denied');
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Partial<ApiError>;
    throw new ApiClientError(response.status, body.error?.message ?? 'The request failed. Please try again.', body.error?.fields, body.error?.code, body.error?.meta);
  }
  return response;
}
export async function apiRequest<T>(schema: z.ZodType<T>, path: string, options: RequestOptions = {}): Promise<T> {
  const response = await apiResponse(path, options);
  return schema.parse(await response.json());
}
export async function downloadDocument(document: DocumentDTO): Promise<void> {
  const response = await apiResponse(`/documents/${document.id}`);
  const url = URL.createObjectURL(await response.blob());
  const link = window.document.createElement('a');
  link.href = url; link.download = document.originalName;
  window.document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : 'The service is unavailable. Please try again.';
}
