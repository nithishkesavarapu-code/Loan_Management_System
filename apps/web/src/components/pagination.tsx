'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({ page, limit, total, disabled, onPage, onLimit }: {
  page: number; limit: number; total: number; disabled: boolean; onPage: (page: number) => void; onLimit: (limit: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return <div className="mt-5 flex flex-wrap items-center justify-between gap-4 text-sm text-zinc-600">
    <label className="flex items-center gap-2">Rows per page
      <select aria-label="Rows per page" value={limit} disabled={disabled} onChange={(event) => onLimit(Number(event.target.value))} className="h-10 rounded-md border border-zinc-300 bg-white px-2">
        {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
      </select>
    </label>
    <div className="flex items-center gap-3">
      <span aria-live="polite">Page {page} of {pages}</span>
      <button type="button" title="Previous page" aria-label="Previous page" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)} className="flex size-10 items-center justify-center rounded-md border border-zinc-300 hover:bg-zinc-100 disabled:opacity-40"><ChevronLeft className="size-4" aria-hidden="true" /></button>
      <button type="button" title="Next page" aria-label="Next page" disabled={disabled || page >= pages} onClick={() => onPage(page + 1)} className="flex size-10 items-center justify-center rounded-md border border-zinc-300 hover:bg-zinc-100 disabled:opacity-40"><ChevronRight className="size-4" aria-hidden="true" /></button>
    </div>
  </div>;
}
