import { redirect } from 'next/navigation';
import { roleHome } from '@lms/shared';
import { getUser } from '@/lib/session';
import { AuthForm } from '@/components/auth-form';

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getUser();
  if (user) redirect(roleHome(user.role));
  const { reason } = await searchParams;
  return <><h1 className="text-2xl font-semibold">Sign in</h1>{reason === 'session-expired' && <p role="status" className="mt-4 text-sm text-amber-800">Your session has expired. Please sign in again.</p>}<AuthForm mode="login" /></>;
}
