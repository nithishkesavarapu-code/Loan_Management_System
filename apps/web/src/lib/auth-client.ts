import { authResponseSchema, type ApiError, type AuthRequest } from '@lms/shared';

export class AuthError extends Error {
  constructor(message: string, public readonly fields: Record<string, string[]> = {}) { super(message); }
}
export async function authenticate(mode: 'login' | 'register', input: AuthRequest) {
  const response = await fetch(`/api/v1/auth/${mode}`, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-LMS-Request': '1' },
    body: JSON.stringify(input), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.json() as ApiError;
    throw new AuthError(body.error?.message ?? 'Unable to sign in. Please try again.', body.error?.fields);
  }
  return authResponseSchema.parse(await response.json()).data;
}
export async function logout(): Promise<void> {
  const response = await fetch('/api/v1/auth/logout', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'X-LMS-Request': '1' }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok && response.status !== 401) throw new Error('Unable to sign out. Please try again.');
}
