'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, RefreshCw, Search, Users, X } from 'lucide-react';
import { applicationStepLabels, leadPageSchema, type LeadSummary, type Page, type SalesListQuery } from '@lms/shared';
import { apiRequest, errorMessage } from '@/lib/api-client';
import { useHydrated } from '@/lib/use-hydrated';
import { Pagination } from '@/components/pagination';

export function LeadList({ initial, query }: { initial: Page<LeadSummary>; query: SalesListQuery }) {
  const hydrated = useHydrated();
  const [result, setResult] = useState(initial);
  const [q, setQ] = useState(query.q ?? '');
  const [activeQ, setActiveQ] = useState(query.q ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function load(page: number, limit: number, search: string) {
    if (pending) return;
    setPending(true); setError('');
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search.trim()) params.set('q', search.trim());
    try {
      setResult(await apiRequest(leadPageSchema, `/sales/leads?${params}`));
      setActiveQ(search.trim());
      window.history.replaceState(null, '', `/dashboard/sales?${params}`);
    } catch (error) { setError(errorMessage(error)); }
    finally { setPending(false); }
  }
  function search(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void load(1, result.pagination.limit, q); }
  const returnQuery = new URLSearchParams({ page: String(result.pagination.page), limit: String(result.pagination.limit), ...(activeQ ? { q: activeQ } : {}) });
  return <section aria-labelledby="leads-heading" className="mt-8">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-5">
      <h2 id="leads-heading" className="text-base font-semibold">Pre-application leads <span className="ml-2 font-normal text-zinc-500">{result.pagination.total}</span></h2>
      <form onSubmit={search} className="flex w-full min-w-0 gap-2 sm:w-auto">
        <label htmlFor="lead-search" className="sr-only">Search borrowers</label>
        <input id="lead-search" type="search" placeholder="Name or email" value={q} onChange={(event) => setQ(event.target.value)} maxLength={100} disabled={!hydrated || pending} className="h-11 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-sm sm:w-64" />
        <button type="submit" title="Search leads" aria-label="Search leads" disabled={!hydrated || pending} className="flex size-11 shrink-0 items-center justify-center rounded-md bg-teal-800 text-white disabled:opacity-40"><Search className="size-4" aria-hidden="true" /></button>
        {activeQ && <button type="button" title="Clear search" aria-label="Clear search" disabled={pending} onClick={() => { setQ(''); void load(1, result.pagination.limit, ''); }} className="flex size-11 shrink-0 items-center justify-center rounded-md border border-zinc-300"><X className="size-4" aria-hidden="true" /></button>}
        <button type="button" title="Refresh leads" aria-label="Refresh leads" disabled={!hydrated || pending} onClick={() => { void load(result.pagination.page, result.pagination.limit, activeQ); }} className="flex size-11 shrink-0 items-center justify-center rounded-md border border-zinc-300 disabled:opacity-40"><RefreshCw className={`size-4 ${pending ? 'animate-spin' : ''}`} aria-hidden="true" /></button>
      </form>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    <div className="hidden grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_44px] gap-5 border-b border-zinc-200 py-3 text-xs font-medium text-zinc-500 lg:grid"><span>Borrower</span><span>Registered</span><span>Progress</span><span>Eligibility</span><span /></div>
    {!result.data.length ? <div className="flex items-center gap-3 py-12 text-sm text-zinc-500"><Users className="size-5" aria-hidden="true" />{activeQ ? 'No matching borrowers.' : 'No pre-application leads.'}</div> : <ul className="divide-y divide-zinc-200" aria-label="Sales leads">
      {result.data.map((lead) => <li key={lead.borrowerId} className="grid min-w-0 grid-cols-[minmax(0,1fr)_44px] items-center gap-x-5 gap-y-3 py-5 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_44px]">
        <div className="min-w-0"><p className="wrap-anywhere text-sm font-medium">{lead.fullName ?? 'New borrower'}</p><p className="mt-1 wrap-anywhere text-sm text-zinc-500">{lead.email}</p></div>
        <p className="col-start-1 text-xs text-zinc-500 lg:col-start-auto lg:text-sm">{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(lead.registeredAt))}</p>
        <p className="col-start-1 text-sm text-zinc-600 lg:col-start-auto">{applicationStepLabels[lead.nextStep]}</p>
        <p className={`col-start-1 text-sm lg:col-start-auto ${lead.eligible ? 'text-teal-800' : 'text-zinc-600'}`}>{lead.eligible === null ? 'Not evaluated' : lead.eligible ? 'Eligible' : 'Not eligible'}</p>
        <Link href={`/dashboard/sales/${lead.borrowerId}?${returnQuery}`} title={`View lead ${lead.email}`} aria-label={`View lead ${lead.email}`} className="col-start-2 row-start-1 flex size-11 items-center justify-center rounded-md border border-zinc-300 hover:bg-zinc-100 lg:col-start-auto lg:row-start-auto"><ArrowRight className="size-4" aria-hidden="true" /></Link>
      </li>)}
    </ul>}
    <Pagination {...result.pagination} disabled={!hydrated || pending} onPage={(page) => { void load(page, result.pagination.limit, activeQ); }} onLimit={(limit) => { void load(1, limit, activeQ); }} />
  </section>;
}
