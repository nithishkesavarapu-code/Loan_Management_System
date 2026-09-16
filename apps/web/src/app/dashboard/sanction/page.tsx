import { loanStatusLabels, sanctionLoanListQuerySchema, sanctionLoanPageSchema } from '@lms/shared';
import { requireRoles } from '@/lib/session';
import { serverApi } from '@/lib/api-server';
import { AccountDetails, WorkspaceShell } from '@/components/workspace-shell';
import { LoanQueue } from '@/features/operations/loan-queue';

export default async function SanctionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRoles(['SANCTION', 'ADMIN']);
  const parsed = sanctionLoanListQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : { page: 1, limit: 20, status: 'APPLIED' as const };
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit), status: query.status, ...(query.q ? { q: query.q } : {}) });
  const initial = await serverApi(sanctionLoanPageSchema, `/sanction/loans?${params}`);
  const statuses = [{ value: 'APPLIED', label: loanStatusLabels.APPLIED }, { value: 'ALL', label: 'All history' }, ...(['SANCTIONED', 'REJECTED', 'DISBURSED', 'CLOSED'] as const).map((status) => ({ value: status, label: loanStatusLabels[status] }))];
  return <WorkspaceShell user={user} active="/dashboard/sanction"><h1 className="text-2xl font-semibold">Sanction</h1><LoanQueue key={params.toString()} initial={initial} query={query} endpoint="/sanction/loans" detailPath="/dashboard/sanction" heading="Loan review queue" statuses={statuses} kind="sanction" /><AccountDetails user={user} /></WorkspaceShell>;
}
