import { collectionLoanListQuerySchema, collectionLoanPageSchema, loanStatusLabels } from '@lms/shared';
import { requireRoles } from '@/lib/session';
import { serverApi } from '@/lib/api-server';
import { AccountDetails, WorkspaceShell } from '@/components/workspace-shell';
import { LoanQueue } from '@/features/operations/loan-queue';

export default async function CollectionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRoles(['COLLECTION', 'ADMIN']);
  const parsed = collectionLoanListQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : { page: 1, limit: 20, status: 'DISBURSED' as const };
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit), status: query.status, ...(query.q ? { q: query.q } : {}) });
  const initial = await serverApi(collectionLoanPageSchema, `/collection/loans?${params}`);
  const statuses = [{ value: 'DISBURSED', label: loanStatusLabels.DISBURSED }, { value: 'ALL', label: 'All history' }, { value: 'CLOSED', label: loanStatusLabels.CLOSED }];
  return <WorkspaceShell user={user} active="/dashboard/collection"><h1 className="text-2xl font-semibold">Collection</h1><LoanQueue key={params.toString()} initial={initial} query={query} endpoint="/collection/loans" detailPath="/dashboard/collection" heading="Collection queue" statuses={statuses} kind="collection" /><AccountDetails user={user} /></WorkspaceShell>;
}
