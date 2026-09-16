import { formatINR, type Page, type PaymentDTO } from '@lms/shared';
import { Pagination } from '@/components/pagination';

const timestamp = (date: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(date));

export function PaymentHistory({ payments, disabled = false, onPage, onLimit }: {
  payments: Page<PaymentDTO>; disabled?: boolean; onPage?: (page: number) => void; onLimit?: (limit: number) => void;
}) {
  return <section aria-labelledby="payment-history-heading" className="mt-8 border-t border-zinc-200 pt-6">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="payment-history-heading" className="text-base font-semibold">Payment history</h2><p className="text-sm text-zinc-500">{payments.pagination.total} recorded</p></div>
    {!payments.data.length ? <p className="py-8 text-sm text-zinc-500">No payments have been recorded.</p> : <ol aria-label="Payment history" className="mt-3 divide-y divide-zinc-200">
      {payments.data.map((payment) => <li key={payment.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0"><p className="break-all text-sm font-medium">{payment.utr}</p><p className="mt-1 text-xs text-zinc-500">Payment date {payment.paymentDate} / Recorded {timestamp(payment.createdAt)}</p></div>
        <p className="text-sm font-semibold sm:text-right">{formatINR(payment.amountPaise)}</p>
      </li>)}
    </ol>}
    {onPage && onLimit && <Pagination {...payments.pagination} disabled={disabled} onPage={onPage} onLimit={onLimit} />}
  </section>;
}
