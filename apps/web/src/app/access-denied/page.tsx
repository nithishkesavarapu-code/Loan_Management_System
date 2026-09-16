import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { roleHome } from '@lms/shared';
import { requireUser } from '@/lib/session';
import { WorkspaceShell } from '@/components/workspace-shell';

export default async function AccessDeniedPage() {
  const user = await requireUser();
  return <WorkspaceShell user={user}>
    <ShieldAlert className="mb-4 size-8 text-amber-700" aria-hidden="true" />
    <h1 className="text-2xl font-semibold">Access denied</h1>
    <p className="mt-3 text-sm text-zinc-600">Your account does not have access to this area.</p>
    <Link href={roleHome(user.role)} className="mt-6 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-teal-800 underline underline-offset-4"><ArrowLeft className="size-4" aria-hidden="true" />Return to my workspace</Link>
  </WorkspaceShell>;
}
