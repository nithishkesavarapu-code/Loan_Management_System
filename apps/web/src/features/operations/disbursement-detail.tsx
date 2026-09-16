'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { formatINR, loanDetailResponseSchema, loanStatusLabels, roleLabels, type LoanDetail } from '@lms/shared';
import { ApiClientError, apiRequest, errorMessage } from '@/lib/api-client';
import { useHydrated } from '@/lib/use-hydrated';
import { LoanStatusLabel } from '@/features/loans/loan-status';

const timestamp = (date: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(date));
function Value({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-sm text-zinc-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium [overflow-wrap:anywhere]">{value}</dd></div>; }
export function DisbursementDetail({ initial }: { initial: LoanDetail }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [loan, setLoan] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function refresh() {
    if (pending) return;
    setPending(true); setError('');
    try { setLoan((await apiRequest(loanDetailResponseSchema, `/disbursement/loans/${loan.id}`)).data); }
    catch (error) { setError(errorMessage(error)); }
    finally { setPending(false); }
  }
  async function disburse() {
    if (pending) return;
    setPending(true); setError('');
    try { await apiRequest(loanDetailResponseSchema, `/disbursement/loans/${loan.id}/disburse`, { method: 'POST', data: {} }); router.replace('/dashboard/disbursement?status=SANCTIONED'); router.refresh(); }
    catch (error) {
      setError(errorMessage(error));
      if (error instanceof ApiClientError && error.code === 'INVALID_LOAN_STATE') {
        try { setLoan((await apiRequest(loanDetailResponseSchema, `/disbursement/loans/${loan.id}`)).data); }
        catch { setError(`${errorMessage(error)} Refresh the loan before trying again.`); }
      }
    }
    finally { setPending(false); }
  }
  return <>
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h1 className="wrap-anywhere text-2xl font-semibold">{loan.borrower.fullName}</h1><p className="mt-2 wrap-anywhere text-sm text-zinc-600">{loan.borrower.email}</p></div><div className="flex items-center gap-3"><LoanStatusLabel status={loan.status} /><button type="button" title="Refresh loan" aria-label="Refresh loan" disabled={!hydrated || pending} onClick={() => { void refresh(); }} className="flex size-11 items-center justify-center rounded-md border border-zinc-300 hover:bg-zinc-100 disabled:opacity-40"><RefreshCw className={`size-4 ${pending ? 'animate-spin' : ''}`} aria-hidden="true" /></button></div></div>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    <section aria-label="Disbursement action" className="mt-7 border-y border-zinc-200 py-6"><h2 className="text-base font-semibold">Disbursement</h2>{loan.status === 'SANCTIONED' ? <button type="button" disabled={!hydrated || pending} onClick={() => { void disburse(); }} className="mt-4 min-h-11 rounded-md bg-teal-800 px-4 text-sm font-medium text-white disabled:opacity-40">Mark disbursed</button> : <p className="mt-4 text-sm text-zinc-600">This loan has already been disbursed.</p>}</section>
    <section aria-label="Loan terms" className="mt-7 border-b border-zinc-200 pb-6"><h2 className="text-base font-semibold">Loan terms</h2><dl className="mt-5 grid min-w-0 grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4"><Value label="Principal" value={formatINR(loan.principalPaise)} /><Value label="Tenure" value={`${loan.tenureDays} days`} /><Value label="Annual interest rate" value={`${loan.annualRatePercent}% p.a.`} /><Value label="Interest" value={formatINR(loan.interestPaise)} /><Value label="Total repayment" value={formatINR(loan.totalRepaymentPaise)} /><Value label="Paid" value={formatINR(loan.totalPaidPaise)} /><Value label="Outstanding" value={formatINR(loan.outstandingPaise)} /></dl></section>
    <section aria-label="Status history" className="mt-8 border-t border-zinc-200 pt-6"><h2 className="text-base font-semibold">Status history</h2><ol className="mt-3 divide-y divide-zinc-200">{loan.statusHistory.map((event, index) => <li key={`${event.occurredAt}-${index}`} className="py-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{loanStatusLabels[event.toStatus]}</p><time dateTime={event.occurredAt} className="text-xs text-zinc-500">{timestamp(event.occurredAt)}</time></div><p className="mt-1 text-xs text-zinc-500">{roleLabels[event.actorRole]}</p></li>)}</ol></section>
  </>;
}
