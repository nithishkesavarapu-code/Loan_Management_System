'use client';

import { useState, type FormEvent } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { formatINR, indiaDate, loanDetailResponseSchema, loanStatusLabels, paymentPageSchema, recordPaymentResponseSchema, recordPaymentSchema, roleLabels, rupeesToPaise, type LoanDetail, type Page, type PaymentDTO } from '@lms/shared';
import { ApiClientError, apiRequest, errorMessage } from '@/lib/api-client';
import { useHydrated } from '@/lib/use-hydrated';
import { LoanStatusLabel } from '@/features/loans/loan-status';
import { PaymentHistory } from './payment-history';

const timestamp = (date: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(date));
function Value({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-sm text-zinc-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium [overflow-wrap:anywhere]">{value}</dd></div>; }
function paymentDateFor(timestampValue: string | null) { return timestampValue ? indiaDate(new Date(timestampValue)) : ''; }

export function CollectionDetail({ initial, initialPayments }: { initial: LoanDetail; initialPayments: Page<PaymentDTO> }) {
  const hydrated = useHydrated();
  const [loan, setLoan] = useState(initial);
  const [payments, setPayments] = useState(initialPayments);
  const [utr, setUtr] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const minimumDate = paymentDateFor(loan.disbursedAt);
  const maximumDate = indiaDate(new Date());

  async function fetchPayments(page = payments.pagination.page, limit = payments.pagination.limit) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    return apiRequest(paymentPageSchema, `/collection/loans/${loan.id}/payments?${params}`);
  }
  async function refresh() {
    if (pending) return;
    setPending(true); setError(''); setNotice('');
    try {
      const [loanResponse, paymentResponse] = await Promise.all([
        apiRequest(loanDetailResponseSchema, `/collection/loans/${loan.id}`), fetchPayments(),
      ]);
      setLoan(loanResponse.data); setPayments(paymentResponse);
    } catch (error) { setError(errorMessage(error)); }
    finally { setPending(false); }
  }
  async function changePayments(page: number, limit = payments.pagination.limit) {
    if (pending) return;
    setPending(true); setError(''); setNotice('');
    try { setPayments(await fetchPayments(page, limit)); }
    catch (error) { setError(errorMessage(error)); }
    finally { setPending(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || loan.status !== 'DISBURSED') return;
    let amountPaise: number;
    try { amountPaise = rupeesToPaise(amount); }
    catch { setError('Enter a positive amount in INR with at most two decimal places.'); return; }
    if (amountPaise < 1) { setError('Enter a positive payment amount.'); return; }
    const input = recordPaymentSchema.safeParse({ utr, amountPaise, paymentDate });
    if (!input.success) { setError(input.error.issues[0]!.message); return; }
    setPending(true); setError(''); setNotice('');
    try {
      const result = await apiRequest(recordPaymentResponseSchema, `/collection/loans/${loan.id}/payments`, {
        method: 'POST', data: input.data,
      });
      setLoan(result.data.loan);
      setUtr(''); setAmount(''); setPaymentDate('');
      setNotice(result.data.loan.status === 'CLOSED' ? 'Final payment recorded. This loan is now closed.' : 'Payment recorded.');
      try { setPayments(await fetchPayments(1)); }
      catch { setError('Payment recorded, but history could not be refreshed. Refresh the loan to reload it.'); }
    } catch (error) {
      setError(error instanceof ApiClientError ? errorMessage(error) : 'Payment could not be confirmed. Refresh history before retrying with the same UTR.');
      if (!(error instanceof ApiClientError) || ['INVALID_LOAN_STATE', 'PAYMENT_EXCEEDS_OUTSTANDING', 'UTR_ALREADY_EXISTS', 'PAYMENT_UNCONFIRMED'].includes(error.code)) {
        try {
          const latest = (await apiRequest(loanDetailResponseSchema, `/collection/loans/${loan.id}`)).data;
          setLoan(latest); setPayments(await fetchPayments(1));
        } catch {}
      }
    }
    finally { setPending(false); }
  }

  return <>
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h1 className="wrap-anywhere text-2xl font-semibold">{loan.borrower.fullName}</h1><p className="mt-2 wrap-anywhere text-sm text-zinc-600">{loan.borrower.email}</p></div><div className="flex items-center gap-3"><LoanStatusLabel status={loan.status} /><button type="button" title="Refresh loan" aria-label="Refresh loan" disabled={!hydrated || pending} onClick={() => { void refresh(); }} className="flex size-11 items-center justify-center rounded-md border border-zinc-300 hover:bg-zinc-100 disabled:opacity-40"><RefreshCw className={`size-4 ${pending ? 'animate-spin' : ''}`} aria-hidden="true" /></button></div></div>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}{notice && <p role="status" className="mt-4 text-sm text-teal-800">{notice}</p>}
    <section aria-label="Loan terms" className="mt-7 border-y border-zinc-200 py-6"><h2 className="text-base font-semibold">Loan terms</h2><dl className="mt-5 grid min-w-0 grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4"><Value label="Principal" value={formatINR(loan.principalPaise)} /><Value label="Tenure" value={`${loan.tenureDays} days`} /><Value label="Annual interest rate" value={`${loan.annualRatePercent}% p.a.`} /><Value label="Interest" value={formatINR(loan.interestPaise)} /><Value label="Total repayment" value={formatINR(loan.totalRepaymentPaise)} /><Value label="Paid" value={formatINR(loan.totalPaidPaise)} /><Value label="Outstanding" value={formatINR(loan.outstandingPaise)} /></dl></section>
    <section aria-labelledby="record-payment-heading" className="mt-8 border-b border-zinc-200 pb-8"><h2 id="record-payment-heading" className="text-base font-semibold">Record payment</h2>{loan.status !== 'DISBURSED' ? <p className="mt-4 text-sm text-zinc-600">This loan is {loanStatusLabels[loan.status].toLocaleLowerCase('en-US')} and cannot accept further payments.</p> : <form onSubmit={submit} className="mt-5 grid max-w-3xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="grid gap-2 text-sm font-medium">UTR<input aria-label="UTR" value={utr} onChange={(event) => setUtr(event.target.value)} maxLength={100} autoCapitalize="characters" required disabled={!hydrated || pending} className="h-11 rounded-md border border-zinc-300 px-3 font-normal" /></label>
      <label className="grid gap-2 text-sm font-medium">Amount (INR)<input aria-label="Amount in INR" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" required disabled={!hydrated || pending} className="h-11 rounded-md border border-zinc-300 px-3 font-normal" /></label>
      <label className="grid gap-2 text-sm font-medium">Payment date<input aria-label="Payment date" type="date" value={paymentDate} min={minimumDate} max={maximumDate} onChange={(event) => setPaymentDate(event.target.value)} required disabled={!hydrated || pending} className="h-11 rounded-md border border-zinc-300 px-3 font-normal" /></label>
      <button type="submit" disabled={!hydrated || pending} className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-teal-800 px-4 text-sm font-medium text-white disabled:opacity-40">{pending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}Record payment</button>
    </form>}</section>
    <PaymentHistory payments={payments} disabled={!hydrated || pending} onPage={(page) => { void changePayments(page); }} onLimit={(limit) => { void changePayments(1, limit); }} />
    <section aria-label="Status history" className="mt-8 border-t border-zinc-200 pt-6"><h2 className="text-base font-semibold">Status history</h2><ol className="mt-3 divide-y divide-zinc-200">{loan.statusHistory.map((event, index) => <li key={`${event.occurredAt}-${index}`} className="py-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{loanStatusLabels[event.toStatus]}</p><time dateTime={event.occurredAt} className="text-xs text-zinc-500">{timestamp(event.occurredAt)}</time></div><p className="mt-1 text-xs text-zinc-500">{roleLabels[event.actorRole]}</p></li>)}</ol></section>
  </>;
}
