import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { z } from 'zod';
import { SESSION_COOKIE } from '@lms/shared';
import { requireUser } from './session';

export async function serverApi<T>(schema: z.ZodType<T>, path: string): Promise<T> {
  await requireUser();
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value ?? '';
  const response = await fetch(`${process.env.API_ORIGIN ?? 'http://127.0.0.1:4000'}/api/v1${path}`, {
    headers: { Cookie: `${SESSION_COOKIE}=${encodeURIComponent(cookie)}` }, cache: 'no-store', signal: AbortSignal.timeout(10000),
  });
  if (response.status === 401) redirect('/login');
  if (response.status === 403) redirect('/access-denied');
  if (response.status === 404 || response.status === 400) notFound();
  if (!response.ok) throw new Error('The requested data is temporarily unavailable.');
  return schema.parse(await response.json());
}
