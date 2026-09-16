'use client';

import { useState } from 'react';
import { CheckCircle2, Download, FileText, LoaderCircle, RefreshCw } from 'lucide-react';
import { employmentLabels, formatINR, loanStatusLabels, paymentPageSchema, reviewedLoanResponseSchema, roleLabels, type Page, type PaymentDTO, type ReviewedLoanDetail } from '@lms/shared';
import { apiRequest, downloadDocument, errorMessage } from '@/lib/api-client';
import { useHydrated } from '@/lib/use-hydrated';
import { LoanStatusLabel } from './loan-status';
import { PaymentHistory } from '@/features/payments/payment-history';

const timestamp = (date: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(date));
function Value({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-sm text-zinc-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium [overflow-wrap:anywhere]">{value}</dd></div>;
}
export function LoanDetailView({ initial, initialPayments }: { initial: ReviewedLoanDetail; initialPayments: Page<PaymentDTO> }) {
  const hydrated = useHydrated();
  const [loan, setLoan] = useState(initial);
  const [payments, setPayments] = useState(initialPayments);
  const [pending, setPending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  async function fetchPayments(page = payments.pagination.page, limit = payments.pagination.limit) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    return apiRequest(paymentPageSchema, `/borrower/loans/${loan.id}/payments?${params}`);
  }
  async function changePayments(page: number, limit = payments.pagination.limit) {
    if (pending) return;
    setPending(true); setError('');
    try { setPayments(await fetchPayments(page, limit)); }
    catch (error) { setError(errorMessage(error)); }
    finally { setPending(false); }
  }
  async function refresh() {
    if (pending) return;
    setPending(true); setError('');
    try {
      const [loanResponse, paymentResponse] = await Promise.all([
        apiRequest(reviewedLoanResponseSchema, `/borrower/loans/${loan.id}`), fetchPayments(),
      ]);
      setLoan(loanResponse.data); setPayments(paymentResponse);
    }
    catch (error) { setError(errorMessage(error)); }
    finally { setPending(false); }
  }
  async function download() {
    setDownloading(true); setError('');
    try { await downloadDocument(loan.salarySlip); }
    catch (error) { setError(errorMessage(error)); }
    finally { setDownloading(false); }
  }
  return <>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><h1 className="text-2xl font-semibold">Loan application</h1><p className="mt-2 break-all text-sm text-zinc-500">{loan.id}</p></div>
      <div className="flex items-center gap-3"><LoanStatusLabel status={loan.status} /><button type="button" title="Refresh loan" aria-label="Refresh loan" disabled={!hydrated || pending} onClick={() => { void refresh(); }} className="flex size-11 items-center justify-center rounded-md border border-zinc-300 hover:bg-zinc-100 disabled:opacity-40"><RefreshCw className={`size-4 ${pending ? 'animate-spin' : ''}`} aria-hidden="true" /></button></div>
    </div>
    <p className="mt-5 flex items-center gap-2 text-sm text-teal-800"><CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />Submitted {timestamp(loan.createdAt)}</p>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {loan.rejectionReason && <section aria-label="Rejection reason" className="mt-6 border-l-2 border-red-700 pl-4"><h2 className="text-sm font-semibold text-red-800">Rejection reason</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{loan.rejectionReason}</p></section>}
    <section aria-label="Loan terms" className="mt-7 border-y border-zinc-200 py-6"><h2 className="text-base font-semibold">Loan terms</h2><dl className="mt-5 grid min-w-0 grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
      <Value label="Principal" value={formatINR(loan.principalPaise)} /><Value label="Tenure" value={`${loan.tenureDays} days`} />
      <Value label="Annual interest rate" value={`${loan.annualRatePercent}% p.a.`} /><Value label="Interest" value={formatINR(loan.interestPaise)} />
      <Value label="Total repayment" value={formatINR(loan.totalRepaymentPaise)} /><Value label="Paid" value={formatINR(loan.totalPaidPaise)} />
      <Value label="Outstanding" value={formatINR(loan.outstandingPaise)} />
    </dl></section>
    <PaymentHistory payments={payments} disabled={!hydrated || pending} onPage={(page) => { void changePayments(page); }} onLimit={(limit) => { void changePayments(1, limit); }} />
    <div className="mt-7 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_290px]">
      <section aria-label="Submitted personal details"><h2 className="text-base font-semibold">Submitted personal details</h2><dl className="mt-5 grid min-w-0 gap-x-6 gap-y-5 sm:grid-cols-2">
        <Value label="Full name" value={loan.applicantSnapshot.fullName} /><Value label="Email" value={loan.applicantSnapshot.email} />
        <Value label="PAN" value={loan.applicantSnapshot.pan} /><Value label="Date of birth" value={loan.applicantSnapshot.dob} />
        <Value label="Monthly salary" value={formatINR(loan.applicantSnapshot.monthlySalaryPaise)} /><Value label="Employment mode" value={employmentLabels[loan.applicantSnapshot.employmentMode]} />
      </dl><p className="mt-5 text-sm text-teal-800">Eligible at submission / Age {loan.eligibilityAtSubmission.ageYears}</p></section>
      <section aria-label="Submitted salary slip" className="min-w-0 border-t border-zinc-200 pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-7"><h2 className="text-base font-semibold">Salary slip</h2>
        <div className="mt-4 flex min-w-0 items-start gap-3"><FileText className="mt-1 size-5 shrink-0 text-teal-800" aria-hidden="true" /><p className="min-w-0 flex-1 break-all text-sm">{loan.salarySlip.originalName}</p>
          <button type="button" title="Download salary slip" aria-label="Download salary slip" disabled={!hydrated || downloading} onClick={() => { void download(); }} className="flex size-11 shrink-0 items-center justify-center rounded-md border border-zinc-300 hover:bg-zinc-100 disabled:opacity-40">{downloading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}</button>
        </div>
      </section>
    </div>
    <section aria-label="Status history" className="mt-8 border-t border-zinc-200 pt-6"><h2 className="text-base font-semibold">Status history</h2><ol className="mt-3 divide-y divide-zinc-200">
      {loan.statusHistory.map((event, index) => <li key={`${event.occurredAt}-${index}`} className="py-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{loanStatusLabels[event.toStatus]}</p><time dateTime={event.occurredAt} className="text-xs text-zinc-500">{timestamp(event.occurredAt)}</time></div><p className="mt-1 text-xs text-zinc-500">{roleLabels[event.actorRole]}</p>{event.reason && <p className="mt-2 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{event.reason}</p>}</li>)}
    </ol></section>
  </>;
}
