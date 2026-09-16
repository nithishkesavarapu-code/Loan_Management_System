import { LoaderCircle } from 'lucide-react';

export function WorkspaceLoading() {
  return <div role="status" aria-live="polite" className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-12 text-sm text-zinc-600 sm:px-8"><LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading workspace...</div>;
}
