import { disbursementLoanListQuerySchema, disbursementLoanPageSchema, loanStatusLabels } from '@lms/shared';
import { requireRoles } from '@/lib/session';
import { serverApi } from '@/lib/api-server';
import { AccountDetails, WorkspaceShell } from '@/components/workspace-shell';
import { LoanQueue } from '@/features/operations/loan-queue';

export default async function DisbursementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRoles(['DISBURSEMENT', 'ADMIN']);
  const parsed = disbursementLoanListQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : { page: 1, limit: 20, status: 'SANCTIONED' as const };
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit), status: query.status, ...(query.q ? { q: query.q } : {}) });
  const initial = await serverApi(disbursementLoanPageSchema, `/disbursement/loans?${params}`);
  const statuses = [{ value: 'SANCTIONED', label: loanStatusLabels.SANCTIONED }, { value: 'ALL', label: 'All history' }, ...(['DISBURSED', 'CLOSED'] as const).map((status) => ({ value: status, label: loanStatusLabels[status] }))];
  return <WorkspaceShell user={user} active="/dashboard/disbursement"><h1 className="text-2xl font-semibold">Disbursement</h1><LoanQueue key={params.toString()} initial={initial} query={query} endpoint="/disbursement/loans" detailPath="/dashboard/disbursement" heading="Release queue" statuses={statuses} kind="disbursement" /><AccountDetails user={user} /></WorkspaceShell>;
}
