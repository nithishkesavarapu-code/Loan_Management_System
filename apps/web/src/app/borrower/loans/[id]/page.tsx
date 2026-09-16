import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { paymentPageSchema, reviewedLoanResponseSchema } from '@lms/shared';
import { requireRoles } from '@/lib/session';
import { serverApi } from '@/lib/api-server';
import { WorkspaceShell } from '@/components/workspace-shell';
import { LoanDetailView } from '@/features/loans/loan-detail';

export default async function BorrowerLoanPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRoles(['BORROWER']);
  const { id } = await params;
  const encoded = encodeURIComponent(id);
  const [loanResponse, payments] = await Promise.all([
    serverApi(reviewedLoanResponseSchema, `/borrower/loans/${encoded}`),
    serverApi(paymentPageSchema, `/borrower/loans/${encoded}/payments`),
  ]);
  const { data } = loanResponse;
  return <WorkspaceShell user={user} active="/borrower">
    <Link href="/borrower" className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm text-teal-800"><ArrowLeft className="size-4" aria-hidden="true" />Applications and loans</Link>
    <LoanDetailView key={data.id + data.updatedAt} initial={data} initialPayments={payments} />
  </WorkspaceShell>;
}
