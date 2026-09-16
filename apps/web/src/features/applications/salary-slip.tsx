'use client';

import { useRef, useState } from 'react';
import { Download, FileCheck2, FileText, LoaderCircle, Upload, X } from 'lucide-react';
import { applicationResponseSchema, documentResponseSchema, salarySlipMaxBytes, salarySlipExtensions, type ApplicationDTO } from '@lms/shared';
import { apiRequest, downloadDocument, errorMessage } from '@/lib/api-client';
import { useHydrated } from '@/lib/use-hydrated';

function fileSize(bytes: number) { return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(2)} MB` : `${Math.max(1, Math.ceil(bytes / 1000))} KB`; }
export function SalarySlip({ application, dirty, busy, onBusy, onUpdated }: {
  application: ApplicationDTO; dirty: boolean; busy: boolean; onBusy: (busy: boolean) => void; onUpdated: (application: ApplicationDTO) => void;
}) {
  const hydrated = useHydrated();
  const input = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const locked = application.state !== 'DRAFT';
  const disabled = !hydrated || busy || locked || dirty || !application.eligibility.eligible;
  const slip = application.salarySlip;
  function clear() { setSelected(null); if (input.current) input.current.value = ''; }
  function select(file: File | undefined) {
    setError(''); setMessage(''); setSelected(file ?? null);
    if (!file) return;
    if (file.size === 0) setError('The selected file is empty.');
    else if (file.size > salarySlipMaxBytes) setError('The maximum file size is 5,000,000 bytes.');
    else if (!Object.values(salarySlipExtensions).flat().some((ext) => file.name.toLowerCase().endsWith(ext))) setError('Select a PDF, JPG or PNG file.');
  }
  async function upload() {
    if (disabled || !selected) return;
    if (selected.size === 0 || selected.size > salarySlipMaxBytes) { select(selected); return; }
    setUploading(true); onBusy(true); setError(''); setMessage('');
    let uploaded = false;
    try {
      const formData = new FormData(); formData.append('file', selected);
      await apiRequest(documentResponseSchema, `/borrower/applications/${application.id}/salary-slip`, { method: 'POST', formData });
      uploaded = true; clear();
      const updated = await apiRequest(applicationResponseSchema, `/borrower/applications/${application.id}`);
      onUpdated(updated.data); setMessage(slip ? 'Salary slip replaced.' : 'Salary slip uploaded.');
    } catch (error) {
      setError(uploaded ? 'The file was uploaded, but the application could not be refreshed. Reload to see the current salary slip.' : errorMessage(error));
      if (!uploaded) {
        try { onUpdated((await apiRequest(applicationResponseSchema, `/borrower/applications/${application.id}`)).data); }
        catch {}
      }
    } finally { setUploading(false); onBusy(false); }
  }
  async function download() {
    if (!slip || downloading) return;
    setDownloading(true); setError('');
    try { await downloadDocument(slip); }
    catch (error) { setError(errorMessage(error)); }
    finally { setDownloading(false); }
  }
  return <section aria-labelledby="salary-slip-heading" className="mt-9 border-t border-zinc-200 pt-7">
    <div className="flex items-center gap-2"><FileText className="size-5 text-teal-800" aria-hidden="true" /><h2 id="salary-slip-heading" className="text-lg font-semibold">Salary slip</h2></div>
    <p id="salary-slip-limits" className="mt-2 text-sm text-zinc-600">PDF, JPG or PNG. Maximum 5 MB (5,000,000 bytes).</p>
    {slip ? <div className="mt-5 flex min-w-0 items-start gap-3 border-y border-zinc-200 py-4">
      <FileCheck2 className="mt-1 size-5 shrink-0 text-teal-700" aria-hidden="true" />
      <div className="min-w-0 flex-1"><p className="break-all text-sm font-medium">{slip.originalName}</p><p className="mt-1 text-sm text-zinc-500">{fileSize(slip.sizeBytes)}</p></div>
      <button type="button" title="Download salary slip" aria-label="Download salary slip" disabled={!hydrated || downloading || uploading} onClick={() => { void download(); }} className="flex size-11 shrink-0 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-100 disabled:opacity-40">
        {downloading ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <Download className="size-5" aria-hidden="true" />}
      </button>
    </div> : <p className="mt-5 text-sm text-zinc-500">No salary slip attached.</p>}
    {!locked && <div className="mt-5">
      <label htmlFor="salary-slip-file" className="text-sm font-medium">{slip ? 'Replacement file' : 'Salary-slip file'}</label>
      <input ref={input} id="salary-slip-file" type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={disabled} aria-describedby="salary-slip-limits" onChange={(event) => select(event.target.files?.[0])} className="mt-2 block w-full min-w-0 max-w-full rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-600 file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium disabled:opacity-50" />
      {selected && <div className="mt-2 flex min-w-0 items-center gap-2 text-sm text-zinc-600"><span className="min-w-0 flex-1 break-all">{selected.name} ({fileSize(selected.size)})</span><button type="button" title="Clear selected file" aria-label="Clear selected file" disabled={uploading} onClick={() => { clear(); setError(''); }} className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-zinc-100"><X className="size-4" aria-hidden="true" /></button></div>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={disabled || !selected || selected.size === 0 || selected.size > salarySlipMaxBytes} onClick={() => { void upload(); }} className="flex min-h-11 items-center gap-2 rounded-md bg-teal-800 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-40">
          {uploading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}{uploading ? 'Uploading...' : slip ? 'Replace salary slip' : 'Upload salary slip'}
        </button>
        <span role="status" className="text-sm text-teal-800">{message}</span>
      </div>
      {(dirty || !application.eligibility.eligible) && <p className="mt-3 text-sm text-amber-800">{dirty ? 'Personal details have unsaved changes.' : 'Eligibility checks must pass before upload.'}</p>}
    </div>}
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
  </section>;
}
