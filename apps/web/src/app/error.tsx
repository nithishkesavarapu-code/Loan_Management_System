'use client';

import { RefreshCw } from 'lucide-react';

export default function ErrorPage({ retry }: { retry: () => void }) {
  return <main className="mx-auto max-w-xl px-6 py-16 text-zinc-900">
    <h1 className="text-2xl font-semibold">Temporarily unavailable</h1>
    <p className="mt-3 text-sm text-zinc-600">We could not load this page. Please try again.</p>
    <button type="button" onClick={retry} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-md bg-teal-800 px-4 text-sm font-medium text-white"><RefreshCw className="size-4" aria-hidden="true" />Try again</button>
  </main>;
}
