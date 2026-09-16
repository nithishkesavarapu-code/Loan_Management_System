import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { loanDetailResponseSchema } from '@lms/shared';
import { requireRoles } from '@/lib/session';
import { serverApi } from '@/lib/api-server';
import { WorkspaceShell } from '@/components/workspace-shell';
import { queueReturnPath } from '@/features/operations/queue-navigation';
import { DisbursementDetail } from '@/features/operations/disbursement-detail';

export default async function DisbursementLoanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const returnPath = queueReturnPath('disbursement', await searchParams);
  const user = await requireRoles(['DISBURSEMENT', 'ADMIN']);
  const { id } = await params;
  const { data } = await serverApi(loanDetailResponseSchema, `/disbursement/loans/${encodeURIComponent(id)}`);
  return <WorkspaceShell user={user} active="/dashboard/disbursement"><Link href={returnPath} className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm text-teal-800"><ArrowLeft className="size-4" aria-hidden="true" />Disbursement queue</Link><DisbursementDetail initial={data} /></WorkspaceShell>;
}
