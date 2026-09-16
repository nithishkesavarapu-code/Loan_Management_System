import { Landmark } from 'lucide-react';

export function Brand() {
  return <div className="flex min-w-0 items-center gap-3">
    <Landmark className="size-7 shrink-0 text-teal-700" aria-hidden="true" />
    <span className="text-sm font-semibold leading-5">Loan Management System</span>
  </div>;
}
