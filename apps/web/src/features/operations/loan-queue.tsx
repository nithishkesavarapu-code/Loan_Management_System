'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, ClipboardList, RefreshCw, Search, X } from 'lucide-react';
import { collectionLoanPageSchema, disbursementLoanPageSchema, formatINR, sanctionLoanPageSchema, type LoanSummary, type Page } from '@lms/shared';
import { apiRequest, errorMessage } from '@/lib/api-client';
import { useHydrated } from '@/lib/use-hydrated';
import { Pagination } from '@/components/pagination';
import { LoanStatusLabel } from '@/features/loans/loan-status';

type QueueQuery = { page: number; limit: number; status: string; q?: string | undefined };
type QueueStatus = { value: string; label: string };
export function LoanQueue({ initial, query, endpoint, detailPath, heading, statuses, kind }: {
  initial: Page<LoanSummary>; query: QueueQuery; endpoint: string; detailPath: string; heading: string;
  statuses: QueueStatus[]; kind: 'sanction' | 'disbursement' | 'collection';
}) {
  const hydrated = useHydrated();
  const [result, setResult] = useState(initial);
  const [status, setStatus] = useState(query.status);
  const [q, setQ] = useState(query.q ?? '');
  const [activeQ, setActiveQ] = useState(query.q ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const schema = kind === 'sanction' ? sanctionLoanPageSchema : kind === 'disbursement' ? disbursementLoanPageSchema : collectionLoanPageSchema;
  async function load(page: number, limit = result.pagination.limit, nextStatus = status, search = activeQ) {
    if (pending) return;
    setPending(true); setError('');
    const params = new URLSearchParams({ page: String(page), limit: String(limit), status: nextStatus });
    if (search.trim()) params.set('q', search.trim());
    try {
      setResult(await apiRequest(schema, `${endpoint}?${params}`));
      setStatus(nextStatus); setActiveQ(search.trim());
      window.history.replaceState(null, '', `${detailPath}?${params}`);
    } catch (error) { setError(errorMessage(error)); }
    finally { setPending(false); }
  }
  function search(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void load(1, result.pagination.limit, status, q); }
  const returnQuery = new URLSearchParams({ page: String(result.pagination.page), limit: String(result.pagination.limit), status, ...(activeQ ? { q: activeQ } : {}) });
  return <section aria-labelledby="loan-queue-heading" aria-busy={pending} className="mt-8">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-5">
      <div><h2 id="loan-queue-heading" className="text-base font-semibold">{heading} <span className="ml-2 font-normal text-zinc-500">{result.pagination.total}</span></h2></div>
      <div className="grid w-full grid-cols-[minmax(0,1fr)_44px] items-center gap-3 sm:flex sm:flex-wrap sm:justify-end lg:w-auto">
        <label className="col-span-2 flex items-center gap-2 text-sm text-zinc-600">Status
          <select aria-label="Loan status" value={status} disabled={!hydrated || pending} onChange={(event) => { void load(1, result.pagination.limit, event.target.value, activeQ); }} className="h-11 min-w-0 rounded-md border border-zinc-300 bg-white px-2">
            {statuses.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
        </label>
        <form onSubmit={search} className="flex min-w-0 flex-1 gap-2 sm:flex-none">
          <label htmlFor="loan-search" className="sr-only">Search loans</label>
          <input id="loan-search" type="search" placeholder="Borrower or email" value={q} onChange={(event) => setQ(event.target.value)} maxLength={100} disabled={!hydrated || pending} className="h-11 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-sm sm:w-56" />
          <button type="submit" title="Search loans" aria-label="Search loans" disabled={!hydrated || pending} className="flex size-11 shrink-0 items-center justify-center rounded-md bg-teal-800 text-white disabled:opacity-40"><Search className="size-4" aria-hidden="true" /></button>
          {activeQ && <button type="button" title="Clear search" aria-label="Clear search" disabled={pending} onClick={() => { setQ(''); void load(1, result.pagination.limit, status, ''); }} className="flex size-11 shrink-0 items-center justify-center rounded-md border border-zinc-300"><X className="size-4" aria-hidden="true" /></button>}
        </form>
        <button type="button" title="Refresh loans" aria-label="Refresh loans" disabled={!hydrated || pending} onClick={() => { void load(result.pagination.page, result.pagination.limit, status, activeQ); }} className="flex size-11 shrink-0 items-center justify-center rounded-md border border-zinc-300 hover:bg-zinc-100 disabled:opacity-40"><RefreshCw className={`size-4 ${pending ? 'animate-spin' : ''}`} aria-hidden="true" /></button>
      </div>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    <div className="hidden grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_44px] gap-5 border-b border-zinc-200 py-3 text-xs font-medium text-zinc-500 lg:grid"><span>Borrower</span><span>{kind === 'collection' ? 'Paid' : 'Principal'}</span><span>{kind === 'collection' ? 'Outstanding' : 'Terms'}</span><span>Status</span><span /></div>
    {!result.data.length ? <p className="flex items-center gap-3 py-12 text-sm text-zinc-500"><ClipboardList className="size-5" aria-hidden="true" />{activeQ ? 'No matching loans.' : 'No loans in this view.'}</p> : <ul aria-label={heading} className="divide-y divide-zinc-200">
      {result.data.map((loan) => <li key={loan.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_44px] items-center gap-x-5 gap-y-3 py-5 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_44px]">
        <div className="min-w-0"><p className="wrap-anywhere text-sm font-medium">{loan.borrower.fullName}</p><p className="mt-1 wrap-anywhere text-sm text-zinc-500">{loan.borrower.email}</p></div>
        <p className="col-start-1 text-sm font-medium lg:col-start-auto">{kind === 'collection' && <span className="font-normal text-zinc-500 lg:hidden">Paid: </span>}{formatINR(kind === 'collection' ? loan.totalPaidPaise : loan.principalPaise)}</p>
        <p className="col-start-1 text-sm text-zinc-600 lg:col-start-auto">{kind === 'collection' ? <><span className="text-zinc-500 lg:hidden">Outstanding: </span>{formatINR(loan.outstandingPaise)}</> : `${loan.tenureDays} days / ${loan.annualRatePercent}% p.a.`}</p>
        <div className="col-start-1 lg:col-start-auto"><LoanStatusLabel status={loan.status} /></div>
        <Link href={`${detailPath}/${loan.id}?${returnQuery}`} title={`View loan for ${loan.borrower.fullName}`} aria-label={`View loan for ${loan.borrower.fullName}`} className="col-start-2 row-start-1 flex size-11 items-center justify-center rounded-md border border-zinc-300 hover:bg-zinc-100 lg:col-start-auto lg:row-start-auto"><ArrowRight className="size-4" aria-hidden="true" /></Link>
      </li>)}
    </ul>}
    <Pagination {...result.pagination} disabled={!hydrated || pending} onPage={(page) => { void load(page); }} onLimit={(limit) => { void load(1, limit); }} />
  </section>;
}
