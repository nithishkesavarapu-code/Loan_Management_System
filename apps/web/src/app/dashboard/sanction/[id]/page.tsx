import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { reviewedLoanResponseSchema } from '@lms/shared';
import { requireRoles } from '@/lib/session';
import { serverApi } from '@/lib/api-server';
import { WorkspaceShell } from '@/components/workspace-shell';
import { queueReturnPath } from '@/features/operations/queue-navigation';
import { SanctionReview } from '@/features/operations/sanction-review';

export default async function SanctionLoanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const returnPath = queueReturnPath('sanction', await searchParams);
  const user = await requireRoles(['SANCTION', 'ADMIN']);
  const { id } = await params;
  const { data } = await serverApi(reviewedLoanResponseSchema, `/sanction/loans/${encodeURIComponent(id)}`);
  return <WorkspaceShell user={user} active="/dashboard/sanction"><Link href={returnPath} className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm text-teal-800"><ArrowLeft className="size-4" aria-hidden="true" />Sanction queue</Link><SanctionReview initial={data} /></WorkspaceShell>;
}
