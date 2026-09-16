'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Check, LoaderCircle, RefreshCw, Save } from 'lucide-react';
import {
  applicationNextStep, applicationResponseSchema, eligibilityResponseSchema, employmentLabels, employmentModes,
  indiaDate, paiseToRupees, rupeesToPaise, updateApplicationSchema, type ApplicationDTO, type PersonalDetailsDraft,
} from '@lms/shared';
import { apiRequest, ApiClientError, errorMessage } from '@/lib/api-client';
import { useHydrated } from '@/lib/use-hydrated';
import { EligibilityResultView } from '@/components/eligibility-result';
import { SalarySlip } from './salary-slip';
import { LoanConfiguration, loanInput, parseLoanInput } from './loan-configuration';

function formValues(details: PersonalDetailsDraft) {
  return { fullName: details.fullName ?? '', pan: details.pan ?? '', dob: details.dob ?? '',
    salary: details.monthlySalaryPaise === null ? '' : paiseToRupees(details.monthlySalaryPaise), employmentMode: details.employmentMode ?? '' };
}
export function PersonalDetailsForm({ initial }: { initial: ApplicationDTO }) {
  const hydrated = useHydrated();
  const [application, setApplication] = useState(initial);
  const [values, setValues] = useState(() => formValues(initial.personalDetails));
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [loanValues, setLoanValues] = useState(() => loanInput(initial));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const dirty = JSON.stringify(values) !== JSON.stringify(formValues(application.personalDetails));
  const parsedLoan = parseLoanInput(loanValues);
  const loanDirty = !parsedLoan.success || parsedLoan.data.principalPaise !== application.loanConfig.principalPaise || parsedLoan.data.tenureDays !== application.loanConfig.tenureDays;
  const locked = application.state !== 'DRAFT';
  const disabled = !hydrated || pending || uploading || configuring || locked;
  useEffect(() => {
    if (!dirty && !loanDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, loanDirty]);
  function change(field: keyof typeof values, value: string) {
    setValues((previous) => ({ ...previous, [field]: value })); setFields({}); setError(''); setMessage('');
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    setError(''); setMessage(''); setFields({});
    let salary: number | null = null;
    try { if (values.salary.trim()) salary = rupeesToPaise(values.salary); }
    catch { setFields({ 'personalDetails.monthlySalaryPaise': ['Enter a nonnegative amount with at most 2 decimal places.'] }); return; }
    const parsed = updateApplicationSchema(new Date()).safeParse({ personalDetails: {
      fullName: values.fullName.trim() || null, pan: values.pan.trim() || null, dob: values.dob || null,
      monthlySalaryPaise: salary, employmentMode: values.employmentMode || null,
    } });
    if (!parsed.success) {
      const validation: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) (validation[issue.path.join('.')] ??= []).push(issue.message);
      setFields(validation); return;
    }
    setPending(true);
    try {
      const result = await apiRequest(applicationResponseSchema, `/borrower/applications/${application.id}`, { method: 'PATCH', data: parsed.data });
      setApplication(result.data); setValues(formValues(result.data.personalDetails)); setMessage('Draft saved.');
    } catch (error) {
      setError(errorMessage(error));
      if (error instanceof ApiClientError) setFields(error.fields);
    } finally { setPending(false); }
  }
  async function recheck() {
    if (disabled || dirty) return;
    setPending(true); setError(''); setMessage('');
    try {
      const result = await apiRequest(eligibilityResponseSchema, `/borrower/applications/${application.id}/eligibility`, { method: 'POST' });
      setApplication((previous) => ({ ...previous, eligibility: result.data, nextStep: applicationNextStep(result.data.eligible, !!previous.salarySlip, previous.state) }));
    } catch (error) { setError(errorMessage(error)); }
    finally { setPending(false); }
  }
  function fieldError(field: keyof PersonalDetailsDraft) {
    return fields[`personalDetails.${field}`]?.[0];
  }
  const inputClass = 'mt-2 h-12 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15 disabled:bg-zinc-50 aria-invalid:border-red-600';
  const errors = (field: keyof PersonalDetailsDraft) => fieldError(field) ? <p id={`${field}-error`} role="alert" className="mt-2 text-sm text-red-700">{fieldError(field)}</p> : null;
  return <>
    <ol aria-label="Application progress" className="mt-6 flex flex-wrap gap-x-7 gap-y-3 border-b border-zinc-200 pb-5 text-sm">
      <li><a href="#personal-details" className="flex min-h-9 items-center gap-2 font-medium text-teal-800 hover:underline">{!dirty && application.eligibility.eligible ? <Check className="size-4" aria-hidden="true" /> : <span>1.</span>}Personal details</a></li>
      <li><a href="#salary-slip-heading" className={`flex min-h-9 items-center gap-2 hover:underline ${application.salarySlip ? 'text-teal-800' : 'text-zinc-500'}`}>{application.salarySlip ? <Check className="size-4" aria-hidden="true" /> : <span>2.</span>}Salary slip</a></li>
      <li><a href="#loan-configuration-heading" aria-current={!dirty && application.nextStep === 'LOAN_CONFIGURATION' ? 'step' : undefined} className={`flex min-h-9 items-center hover:underline ${!dirty && application.nextStep === 'LOAN_CONFIGURATION' ? 'font-medium text-teal-800' : 'text-zinc-500'}`}>3. Loan configuration</a></li>
    </ol>
    <div className="mt-7 grid min-w-0 gap-9 lg:grid-cols-[minmax(0,1fr)_290px]">
      <form id="personal-details" method="post" noValidate onSubmit={(event) => { void save(event); }} className="min-w-0">
        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          <div className="min-w-0 sm:col-span-2"><label htmlFor="fullName" className="text-sm font-medium">Full name</label>
            <input id="fullName" name="fullName" autoComplete="name" value={values.fullName} disabled={disabled} onChange={(event) => change('fullName', event.target.value)} className={inputClass} aria-invalid={!!fieldError('fullName')} aria-describedby={fieldError('fullName') ? 'fullName-error' : undefined} />{errors('fullName')}</div>
          <div className="min-w-0"><label htmlFor="pan" className="text-sm font-medium">PAN</label>
            <input id="pan" name="pan" value={values.pan} autoComplete="off" spellCheck={false} disabled={disabled} onChange={(event) => change('pan', event.target.value)} className={inputClass} aria-invalid={!!fieldError('pan')} aria-describedby={fieldError('pan') ? 'pan-error' : undefined} />{errors('pan')}</div>
          <div className="min-w-0"><label htmlFor="dob" className="text-sm font-medium">Date of birth</label>
            <input id="dob" name="dob" type="date" max={indiaDate(new Date(application.eligibility.evaluatedAt))} autoComplete="bday" value={values.dob} disabled={disabled} onChange={(event) => change('dob', event.target.value)} className={inputClass} aria-invalid={!!fieldError('dob')} aria-describedby={fieldError('dob') ? 'dob-error' : undefined} />{errors('dob')}</div>
          <div className="min-w-0"><label htmlFor="monthlySalaryPaise" className="text-sm font-medium">Monthly salary (INR)</label>
            <input id="monthlySalaryPaise" name="salary" inputMode="decimal" value={values.salary} disabled={disabled} onChange={(event) => change('salary', event.target.value)} className={inputClass} aria-invalid={!!fieldError('monthlySalaryPaise')} aria-describedby={fieldError('monthlySalaryPaise') ? 'monthlySalaryPaise-error' : undefined} />{errors('monthlySalaryPaise')}</div>
          <div className="min-w-0"><label htmlFor="employmentMode" className="text-sm font-medium">Employment mode</label>
            <select id="employmentMode" name="employmentMode" value={values.employmentMode} disabled={disabled} onChange={(event) => change('employmentMode', event.target.value)} className={inputClass} aria-invalid={!!fieldError('employmentMode')} aria-describedby={fieldError('employmentMode') ? 'employmentMode-error' : undefined}>
              <option value="">Select employment</option>{employmentModes.map((mode) => <option value={mode} key={mode}>{employmentLabels[mode]}</option>)}
            </select>{errors('employmentMode')}</div>
        </div>
        {error && <p role="alert" className="mt-5 text-sm text-red-700">{error}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={disabled} className="flex min-h-11 items-center gap-2 rounded-md bg-teal-800 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50">
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}Save and check
          </button>
          <button type="button" disabled={disabled || dirty} onClick={() => { void recheck(); }} className="flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 px-4 py-3 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"><RefreshCw className="size-4" aria-hidden="true" />Recheck eligibility</button>
          <span role="status" className="text-sm text-teal-800">{message}</span>
        </div>
      </form>
      <aside className="border-t border-zinc-200 pt-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-7"><EligibilityResultView result={application.eligibility} dirty={dirty} /></aside>
    </div>
    <SalarySlip application={application} dirty={dirty} busy={pending || uploading || configuring} onBusy={setUploading} onUpdated={(updated) => {
      setApplication(updated); setValues(formValues(updated.personalDetails));
    }} />
    <LoanConfiguration application={application} values={loanValues} onChange={setLoanValues} personalDirty={dirty} busy={pending || uploading || configuring} onBusy={setConfiguring} onUpdated={(updated) => {
      setApplication(updated); setValues(formValues(updated.personalDetails));
    }} onSaved={(updated) => { setApplication(updated); setValues(formValues(updated.personalDetails)); setLoanValues(loanInput(updated)); }} />
  </>;
}
