import { redirect } from 'next/navigation';
import { roleHome } from '@lms/shared';
import { getUser } from '@/lib/session';
import { AuthForm } from '@/components/auth-form';

export default async function RegisterPage() {
  const user = await getUser();
  if (user) redirect(roleHome(user.role));
  return <><h1 className="text-2xl font-semibold">Create borrower account</h1><AuthForm mode="register" /></>;
}
