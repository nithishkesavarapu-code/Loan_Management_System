import { leadPageSchema, salesListQuerySchema } from '@lms/shared';
import { requireRoles } from '@/lib/session';
import { serverApi } from '@/lib/api-server';
import { AccountDetails, WorkspaceShell } from '@/components/workspace-shell';
import { LeadList } from '@/features/sales/lead-list';

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRoles(['SALES', 'ADMIN']);
  const parsed = salesListQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : { page: 1, limit: 20 };
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit), ...(query.q ? { q: query.q } : {}) });
  const result = await serverApi(leadPageSchema, `/sales/leads?${params}`);
  return <WorkspaceShell user={user} active="/dashboard/sales"><h1 className="text-2xl font-semibold">Sales</h1><LeadList key={params.toString()} initial={result} query={query} /><AccountDetails user={user} /></WorkspaceShell>;
}
