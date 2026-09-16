import { CheckCircle2, CircleAlert, Clock3 } from 'lucide-react';
import { personalFieldLabels, personalFieldNames, type EligibilityResult } from '@lms/shared';

export function EligibilityResultView({ result, dirty = false }: { result: EligibilityResult | null; dirty?: boolean }) {
  const passed = !dirty && result?.eligible;
  const Icon = dirty || !result ? Clock3 : passed ? CheckCircle2 : CircleAlert;
  return <section aria-label="Eligibility result">
    <div className="flex items-center gap-2">
      <Icon className={`size-5 shrink-0 ${passed ? 'text-teal-700' : 'text-amber-700'}`} aria-hidden="true" />
      <h2 className="text-base font-semibold">Eligibility</h2>
    </div>
    <p role="status" className={`mt-3 text-sm font-medium ${passed ? 'text-teal-800' : 'text-zinc-700'}`}>
      {dirty ? 'Unsaved changes' : !result ? 'Not evaluated' : passed ? 'Eligible' : 'Not eligible'}
    </p>
    {!dirty && result && <ul className="mt-4 space-y-4">
      {personalFieldNames.map((field) => {
        const failure = result.failures.find((failure) => failure.field === field);
        return <li key={field} className="flex items-start gap-2 text-sm">
          {failure ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-teal-700" aria-hidden="true" />}
          <div><p className="font-medium">{personalFieldLabels[field]}</p>{failure && <p className="mt-1 text-zinc-600">{failure.message}</p>}</div>
        </li>;
      })}
    </ul>}
    {!dirty && result && <p className="mt-5 text-xs text-zinc-500">Checked {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(result.evaluatedAt))}</p>}
  </section>;
}
