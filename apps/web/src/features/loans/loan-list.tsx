'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { formatINR, loanPageSchema, loanStatuses, loanStatusLabels, type LoanSummary, type Page } from '@lms/shared';
import { apiRequest, errorMessage } from '@/lib/api-client';
import { useHydrated } from '@/lib/use-hydrated';
import { Pagination } from '@/components/pagination';
import { LoanStatusLabel } from './loan-status';

export function LoanList({ initial }: { initial: Page<LoanSummary> }) {
  const hydrated = useHydrated();
  const [result, setResult] = useState(initial);
  const [status, setStatus] = useState('ALL');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function load(page: number, limit = result.pagination.limit, nextStatus = status) {
    if (pending) return;
    setPending(true); setError('');
    try {
      setResult(await apiRequest(loanPageSchema, `/borrower/loans?${new URLSearchParams({ page: String(page), limit: String(limit), status: nextStatus })}`));
      setStatus(nextStatus);
    } catch (error) { setError(errorMessage(error)); }
    finally { setPending(false); }
  }
  return <section aria-label="Loans" className="mt-10 border-t border-zinc-200 pt-7">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-4">
      <h2 className="text-base font-semibold">Loans <span className="ml-2 font-normal text-zinc-500">{result.pagination.total}</span></h2>
      <div className="flex items-center gap-3"><label className="text-sm text-zinc-600">Status
        <select aria-label="Loan status" value={status} disabled={!hydrated || pending} onChange={(event) => { void load(1, result.pagination.limit, event.target.value); }} className="ml-2 h-11 rounded-md border border-zinc-300 bg-white px-2">
          <option value="ALL">All statuses</option>{loanStatuses.map((value) => <option value={value} key={value}>{loanStatusLabels[value]}</option>)}
        </select></label>
        <button type="button" title="Refresh loans" aria-label="Refresh loans" disabled={!hydrated || pending} onClick={() => { void load(result.pagination.page); }} className="flex size-11 items-center justify-center rounded-md border border-zinc-300 hover:bg-zinc-100 disabled:opacity-40"><RefreshCw className="size-4" aria-hidden="true" /></button>
      </div>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {!result.data.length ? <p className="py-8 text-sm text-zinc-500">{status === 'ALL' ? 'No loans submitted yet.' : 'No loans with this status.'}</p> : <ul aria-label="Loan history" className="divide-y divide-zinc-200">
      {result.data.map((loan) => <li key={loan.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-5">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><p className="font-semibold">{formatINR(loan.principalPaise)}</p><LoanStatusLabel status={loan.status} /></div>
          <p className="mt-2 text-sm text-zinc-600">{loan.tenureDays} days / Total {formatINR(loan.totalRepaymentPaise)}</p>
          <p className="mt-1 break-all text-xs text-zinc-500">{loan.id} / {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(loan.createdAt))}</p>
        </div>
        <Link href={`/borrower/loans/${loan.id}`} title="View loan" aria-label={`View loan ${loan.id}`} className="flex size-11 items-center justify-center rounded-md border border-zinc-300 hover:bg-zinc-100"><ArrowRight className="size-4" aria-hidden="true" /></Link>
      </li>)}
    </ul>}
    <Pagination {...result.pagination} disabled={!hydrated || pending} onPage={(page) => { void load(page); }} onLimit={(limit) => { void load(1, limit); }} />
  </section>;
}
