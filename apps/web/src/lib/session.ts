import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authResponseSchema, SESSION_COOKIE, type Role } from '@lms/shared';

export const getUser = cache(async () => {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  const response = await fetch(`${process.env.API_ORIGIN ?? 'http://127.0.0.1:4000'}/api/v1/auth/me`, {
    headers: { Cookie: `${SESSION_COOKIE}=${encodeURIComponent(cookie)}` },
    cache: 'no-store', signal: AbortSignal.timeout(10000),
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('The account service is temporarily unavailable.');
  return authResponseSchema.parse(await response.json()).data;
});
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}
export async function requireRoles(roles: readonly Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect('/access-denied');
  return user;
}
