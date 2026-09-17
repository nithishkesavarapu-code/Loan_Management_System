import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authResponseSchema, SESSION_COOKIE, type Role, type UserDTO } from '@lms/shared';

interface CachedSession {
  user: UserDTO;
  expiresAt: number;
}

const sessionCache = new Map<string, CachedSession>();

export const getUser = cache(async (): Promise<UserDTO | null> => {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  const cached = sessionCache.get(cookie);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.user;
  }

  const response = await fetch(`${process.env.API_ORIGIN ?? 'http://127.0.0.1:4000'}/api/v1/auth/me`, {
    headers: { Cookie: `${SESSION_COOKIE}=${encodeURIComponent(cookie)}` },
    cache: 'no-store', signal: AbortSignal.timeout(10000),
  });
  if (response.status === 401) {
    sessionCache.delete(cookie);
    return null;
  }
  if (!response.ok) throw new Error('The account service is temporarily unavailable.');
  const user = authResponseSchema.parse(await response.json()).data;

  if (sessionCache.size > 500) {
    const now = Date.now();
    for (const [key, val] of sessionCache.entries()) {
      if (val.expiresAt <= now) sessionCache.delete(key);
    }
  }

  sessionCache.set(cookie, { user, expiresAt: Date.now() + 30_000 });
  return user;
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
