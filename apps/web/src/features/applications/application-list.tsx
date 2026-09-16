'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, FileText, LoaderCircle, Plus, RefreshCw } from 'lucide-react';
import { applicationPageSchema, applicationResponseSchema, applicationStepLabels, type ApplicationDTO, type Page } from '@lms/shared';
import { apiRequest, errorMessage } from '@/lib/api-client';
import { useHydrated } from '@/lib/use-hydrated';
import { Pagination } from '@/components/pagination';

export function ApplicationList({ initial }: { initial: Page<ApplicationDTO> }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [result, setResult] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function start() {
    if (pending) return;
    setPending(true); setError('');
    try {
      const { data } = await apiRequest(applicationResponseSchema, '/borrower/applications', { method: 'POST' });
      router.push(`/borrower/applications/${data.id}`);
      router.refresh();
    } catch (error) { setError(errorMessage(error)); setPending(false); }
  }
  async function load(page: number, limit = result.pagination.limit) {
    setPending(true); setError('');
    try { setResult(await apiRequest(applicationPageSchema, `/borrower/applications?page=${page}&limit=${limit}`)); }
    catch (error) { setError(errorMessage(error)); }
    finally { setPending(false); }
  }
  return <section aria-label="Applications" className="mt-8">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-4">
      <h2 className="text-base font-semibold">Applications <span className="ml-2 font-normal text-zinc-500">{result.pagination.total}</span></h2>
      <div className="flex items-center gap-2">
        <button type="button" title="Refresh applications" aria-label="Refresh applications" disabled={!hydrated || pending} onClick={() => { void load(result.pagination.page); }} className="flex size-11 items-center justify-center rounded-md border border-zinc-300 hover:bg-zinc-100 disabled:opacity-40"><RefreshCw className="size-4" aria-hidden="true" /></button>
        <button type="button" disabled={!hydrated || pending} onClick={() => { void start(); }} className="flex min-h-11 items-center gap-2 rounded-md bg-teal-800 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50">
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
          {result.data.some((item) => item.state === 'DRAFT') ? 'Resume application' : 'Start application'}
        </button>
      </div>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {!result.data.length ? <div className="flex items-center gap-3 py-10 text-sm text-zinc-500"><FileText className="size-5" aria-hidden="true" />No applications yet.</div> : <ul className="divide-y divide-zinc-200">
      {result.data.map((item) => <li key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-5">
        <div className="min-w-0"><p className="text-sm font-medium">{item.personalDetails.fullName ?? 'Application draft'}</p><p className="mt-1 text-sm text-zinc-500">{applicationStepLabels[item.nextStep]} - {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(item.updatedAt))}</p></div>
        <Link href={item.loanId ? `/borrower/loans/${item.loanId}` : `/borrower/applications/${item.id}`} title="Open application" aria-label={`Open application ${item.id}`} className="flex size-11 items-center justify-center rounded-md border border-zinc-300 hover:bg-zinc-100"><ArrowRight className="size-4" aria-hidden="true" /></Link>
      </li>)}
    </ul>}
    <Pagination {...result.pagination} disabled={!hydrated || pending} onPage={(page) => { void load(page); }} onLimit={(limit) => { void load(1, limit); }} />
  </section>;
}
