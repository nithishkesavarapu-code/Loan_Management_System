import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { loanDetailResponseSchema, paymentPageSchema } from '@lms/shared';
import { requireRoles } from '@/lib/session';
import { serverApi } from '@/lib/api-server';
import { WorkspaceShell } from '@/components/workspace-shell';
import { queueReturnPath } from '@/features/operations/queue-navigation';
import { CollectionDetail } from '@/features/payments/collection-detail';

export default async function CollectionLoanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const returnPath = queueReturnPath('collection', await searchParams);
  const user = await requireRoles(['COLLECTION', 'ADMIN']);
  const { id } = await params;
  const encoded = encodeURIComponent(id);
  const [loanResponse, payments] = await Promise.all([
    serverApi(loanDetailResponseSchema, `/collection/loans/${encoded}`),
    serverApi(paymentPageSchema, `/collection/loans/${encoded}/payments`),
  ]);
  return <WorkspaceShell user={user} active="/dashboard/collection"><Link href={returnPath} className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm text-teal-800"><ArrowLeft className="size-4" aria-hidden="true" />Collection queue</Link><CollectionDetail initial={loanResponse.data} initialPayments={payments} /></WorkspaceShell>;
}
