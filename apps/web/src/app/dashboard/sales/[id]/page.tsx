import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { applicationStepLabels, employmentLabels, leadResponseSchema, salesListQuerySchema } from '@lms/shared';
import { requireRoles } from '@/lib/session';
import { serverApi } from '@/lib/api-server';
import { WorkspaceShell } from '@/components/workspace-shell';
import { EligibilityResultView } from '@/components/eligibility-result';

export default async function LeadPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRoles(['SALES', 'ADMIN']);
  const { id } = await params;
  const { data } = await serverApi(leadResponseSchema, `/sales/leads/${encodeURIComponent(id)}`);
  const parsed = salesListQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : { page: 1, limit: 20 };
  const returnParams = new URLSearchParams({ page: String(query.page), limit: String(query.limit), ...(query.q ? { q: query.q } : {}) });
  return <WorkspaceShell user={user} active="/dashboard/sales">
    <Link href={`/dashboard/sales?${returnParams}`} className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm text-teal-800"><ArrowLeft className="size-4" aria-hidden="true" />Sales leads</Link>
    <h1 className="wrap-anywhere text-2xl font-semibold">{data.fullName ?? 'New borrower'}</h1>
    <p className="mt-2 wrap-anywhere text-sm text-zinc-600">{data.email}</p>
    <div className="mt-8 grid gap-9 lg:grid-cols-[minmax(0,1fr)_290px]">
      <section aria-label="Lead details"><h2 className="border-b border-zinc-200 pb-4 text-base font-semibold">Application progress</h2>
        <dl className="divide-y divide-zinc-100 text-sm">
          <div className="grid gap-2 py-5 sm:grid-cols-2"><dt className="text-zinc-500">Registered</dt><dd>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(data.registeredAt))}</dd></div>
          <div className="grid gap-2 py-5 sm:grid-cols-2"><dt className="text-zinc-500">Progress</dt><dd>{data.draftId ? applicationStepLabels[data.nextStep] : 'No application started'}</dd></div>
          <div className="grid gap-2 py-5 sm:grid-cols-2"><dt className="text-zinc-500">Employment</dt><dd>{data.employmentMode ? employmentLabels[data.employmentMode] : 'Not provided'}</dd></div>
          <div className="grid gap-2 py-5 sm:grid-cols-2"><dt className="text-zinc-500">Draft updated</dt><dd>{data.draftUpdatedAt ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(data.draftUpdatedAt)) : 'Not started'}</dd></div>
        </dl>
      </section>
      <aside className="border-t border-zinc-200 pt-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-7"><EligibilityResultView result={data.eligibility} /></aside>
    </div>
  </WorkspaceShell>;
}
