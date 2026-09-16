import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { applicationResponseSchema } from '@lms/shared';
import { requireRoles } from '@/lib/session';
import { serverApi } from '@/lib/api-server';
import { WorkspaceShell } from '@/components/workspace-shell';
import { PersonalDetailsForm } from '@/features/applications/personal-details-form';

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRoles(['BORROWER']);
  const { id } = await params;
  const { data } = await serverApi(applicationResponseSchema, `/borrower/applications/${encodeURIComponent(id)}`);
  if (data.state === 'SUBMITTED' && data.loanId) redirect(`/borrower/loans/${data.loanId}`);
  return <WorkspaceShell user={user} active="/borrower">
    <Link href="/borrower" className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm text-teal-800"><ArrowLeft className="size-4" aria-hidden="true" />Applications</Link>
    <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold">Loan application</h1><span className="text-xs font-medium text-zinc-500">{data.state === 'DRAFT' ? 'Draft' : 'Submitted'}</span></div>
    <PersonalDetailsForm key={data.id + data.updatedAt} initial={data} />
  </WorkspaceShell>;
}
