'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calculator, LoaderCircle, Save, Send } from 'lucide-react';
import { applicationResponseSchema, calculateLoan, formatINR, loanConfigurationSchema, loanLimits, objectIdSchema, paiseToRupees, reviewedLoanResponseSchema, rupeesToPaise, type ApplicationDTO } from '@lms/shared';
import { apiRequest, ApiClientError, errorMessage } from '@/lib/api-client';
import { useHydrated } from '@/lib/use-hydrated';

export type LoanInput = { principal: string; tenure: string };
export const loanInput = (application: ApplicationDTO): LoanInput => ({ principal: paiseToRupees(application.loanConfig.principalPaise), tenure: String(application.loanConfig.tenureDays) });
export function parseLoanInput(values: LoanInput) {
  let principalPaise = NaN;
  try { principalPaise = rupeesToPaise(values.principal); } catch {}
  const tenureDays = /^\d+$/.test(values.tenure) ? Number(values.tenure) : NaN;
  return loanConfigurationSchema.safeParse({ principalPaise, tenureDays });
}
export function LoanConfiguration({ application, values, onChange, personalDirty, busy, onBusy, onUpdated, onSaved }: {
  application: ApplicationDTO; values: LoanInput; onChange: (value: LoanInput) => void; personalDirty: boolean;
  busy: boolean; onBusy: (busy: boolean) => void; onUpdated: (application: ApplicationDTO) => void; onSaved: (application: ApplicationDTO) => void;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, setPending] = useState<'save' | 'apply' | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const parsed = parseLoanInput(values);
  const preview = parsed.success ? calculateLoan(parsed.data) : null;
  const locked = application.state !== 'DRAFT';
  const disabled = !hydrated || busy || locked || personalDirty || !application.eligibility.eligible || !application.salarySlip;
  const amountError = !parsed.success && parsed.error.issues.some((issue) => issue.path[0] === 'principalPaise');
  const tenureError = !parsed.success && parsed.error.issues.some((issue) => issue.path[0] === 'tenureDays');
  function change(next: LoanInput) { onChange(next); setError(''); setMessage(''); }
  function openLoan(id: string) {
    router.replace(`/borrower/loans/${objectIdSchema.parse(id)}`); router.refresh();
  }
  async function save(apply: boolean) {
    if (disabled || !parsed.success || pending) return;
    onBusy(true); setPending(apply ? 'apply' : 'save'); setError(''); setMessage('');
    let navigating = false;
    try {
      const saved = await apiRequest(applicationResponseSchema, `/borrower/applications/${application.id}`, { method: 'PATCH', data: { loanConfig: parsed.data } });
      onSaved(saved.data);
      if (!apply) { setMessage('Loan terms saved.'); return; }
      const submitted = await apiRequest(reviewedLoanResponseSchema, `/borrower/applications/${application.id}/submit`, { method: 'POST' });
      navigating = true; openLoan(submitted.data.id);
    } catch (error) {
      const existingId = error instanceof ApiClientError && error.code === 'APPLICATION_ALREADY_SUBMITTED' ? objectIdSchema.safeParse(error.meta?.loanId) : null;
      if (existingId?.success) { navigating = true; openLoan(existingId.data); return; }
      setError(errorMessage(error));
      try {
        const latest = (await apiRequest(applicationResponseSchema, `/borrower/applications/${application.id}`)).data;
        if (latest.state === 'SUBMITTED' && latest.loanId) { navigating = true; openLoan(latest.loanId); }
        else onUpdated(latest);
      } catch {}
    } finally { if (!navigating) { setPending(null); onBusy(false); } }
  }
  const inputClass = 'mt-2 h-12 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15 disabled:bg-zinc-50 aria-invalid:border-red-600';
  return <section aria-labelledby="loan-configuration-heading" className="mt-9 border-t border-zinc-200 pt-7">
    <div className="flex items-center gap-2"><Calculator className="size-5 text-teal-800" aria-hidden="true" /><h2 id="loan-configuration-heading" className="text-lg font-semibold">Loan configuration</h2></div>
    <div className="mt-5 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_290px]">
      <div className="min-w-0 space-y-6">
        <div><label htmlFor="loan-principal" className="text-sm font-medium">Loan amount (INR)</label>
          <input id="loan-principal" inputMode="decimal" value={values.principal} disabled={disabled} onChange={(event) => change({ ...values, principal: event.target.value })} className={inputClass} aria-invalid={amountError} aria-describedby="principal-range" />
          <input type="range" aria-label="Loan amount slider" aria-valuetext={formatINR(preview?.principalPaise ?? application.loanConfig.principalPaise)} min={loanLimits.minPrincipalPaise} max={loanLimits.maxPrincipalPaise} step={1} value={preview?.principalPaise ?? application.loanConfig.principalPaise} disabled={disabled} onChange={(event) => change({ ...values, principal: paiseToRupees(Number(event.target.value)) })} className="mt-3 block h-9 w-full accent-teal-800 disabled:opacity-40" />
          <p id="principal-range" className={`text-sm ${amountError ? 'text-red-700' : 'text-zinc-500'}`}>INR 50,000.00 to INR 5,00,000.00{amountError ? '; at most 2 decimal places.' : ''}</p>
        </div>
        <div><label htmlFor="loan-tenure" className="text-sm font-medium">Tenure (days)</label>
          <input id="loan-tenure" type="number" inputMode="numeric" min={loanLimits.minTenureDays} max={loanLimits.maxTenureDays} step={1} value={values.tenure} disabled={disabled} onChange={(event) => change({ ...values, tenure: event.target.value })} className={inputClass} aria-invalid={tenureError} aria-describedby="tenure-range" />
          <input type="range" aria-label="Tenure slider" aria-valuetext={`${preview?.tenureDays ?? application.loanConfig.tenureDays} days`} min={loanLimits.minTenureDays} max={loanLimits.maxTenureDays} step={1} value={preview?.tenureDays ?? application.loanConfig.tenureDays} disabled={disabled} onChange={(event) => change({ ...values, tenure: event.target.value })} className="mt-3 block h-9 w-full accent-teal-800 disabled:opacity-40" />
          <p id="tenure-range" className={`text-sm ${tenureError ? 'text-red-700' : 'text-zinc-500'}`}>30 to 365 whole days</p>
        </div>
      </div>
      <section aria-label="Repayment preview" className="border-t border-zinc-200 pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-7">
        <h3 className="text-base font-semibold">Repayment preview</h3>
        <dl className="mt-4 space-y-4 text-sm" aria-live="polite">
          <div><dt className="text-zinc-500">Principal</dt><dd className="mt-1 font-medium">{preview ? formatINR(preview.principalPaise) : 'Unavailable'}</dd></div>
          <div><dt className="text-zinc-500">Annual interest rate</dt><dd className="mt-1 font-medium">12% p.a. (simple interest)</dd></div>
          <div><dt className="text-zinc-500">Interest</dt><dd className="mt-1 font-medium">{preview ? formatINR(preview.interestPaise) : 'Unavailable'}</dd></div>
          <div className="border-t border-zinc-200 pt-4"><dt className="text-zinc-500">Total repayment</dt><dd className="mt-1 text-xl font-semibold text-teal-800">{preview ? formatINR(preview.totalRepaymentPaise) : 'Unavailable'}</dd></div>
        </dl>
      </section>
    </div>
    {!locked && <div className="mt-6 flex flex-wrap items-center gap-3">
      <button type="button" disabled={disabled || !parsed.success} onClick={() => { void save(false); }} className="flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 px-4 py-3 text-sm font-medium hover:bg-zinc-100 disabled:opacity-40">{pending === 'save' ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}Save loan terms</button>
      <button type="button" disabled={disabled || !parsed.success} onClick={() => { void save(true); }} className="flex min-h-11 items-center gap-2 rounded-md bg-teal-800 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-40">{pending === 'apply' ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}{pending === 'apply' ? 'Applying...' : 'Apply'}</button>
      <span role="status" className="text-sm text-teal-800">{message}</span>
    </div>}
    {!locked && (personalDirty || !application.eligibility.eligible || !application.salarySlip) && <p className="mt-3 text-sm text-amber-800">{personalDirty ? 'Personal details have unsaved changes.' : !application.eligibility.eligible ? 'Eligibility checks must pass before applying.' : 'A salary slip is required before applying.'}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
  </section>;
}
