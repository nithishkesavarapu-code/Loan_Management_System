import { loanStatusLabels, type LoanStatus } from '@lms/shared';

const colors: Record<LoanStatus, string> = { APPLIED: 'bg-amber-50 text-amber-900', SANCTIONED: 'bg-teal-50 text-teal-800', REJECTED: 'bg-red-50 text-red-800', DISBURSED: 'bg-sky-50 text-sky-800', CLOSED: 'bg-zinc-100 text-zinc-700' };
export function LoanStatusLabel({ status }: { status: LoanStatus }) {
  return <span className={`inline-flex shrink-0 items-center rounded px-2 py-1 text-xs font-medium ${colors[status]}`}>{loanStatusLabels[status]}</span>;
}
