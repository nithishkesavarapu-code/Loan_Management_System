import Link from 'next/link';
import { Activity, BadgeCheck, Banknote, FileText, ClipboardCheck, Users, Wallet } from 'lucide-react';
import { canAccessModule, dashboardModules, moduleLabels, roleLabels, type UserDTO } from '@lms/shared';
import { Brand } from './brand';
import { SessionControls } from './session-controls';

const moduleIcons = { sales: Users, sanction: ClipboardCheck, disbursement: Banknote, collection: Wallet };
export function WorkspaceShell({ user, active, children }: { user: UserDTO; active?: string; children: React.ReactNode }) {
  const links = user.role === 'BORROWER'
    ? [{ href: '/borrower', label: 'My applications', Icon: FileText }]
    : dashboardModules.filter((module) => canAccessModule(user.role, module))
      .map((module) => ({ href: `/dashboard/${module}`, label: moduleLabels[module], Icon: moduleIcons[module] }));
  links.push({ href: '/status', label: 'Service status', Icon: Activity });
  return <div className="min-h-dvh bg-white text-zinc-900">
    <a href="#workspace-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:p-3 focus:text-teal-800 focus:shadow">Skip to main content</a>
    <header className="border-b border-zinc-200">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-5 px-5 py-5 sm:px-8"><Brand /><SessionControls user={user} /></div>
      <nav aria-label="Workspace" className="mx-auto flex max-w-6xl flex-wrap gap-x-5 gap-y-1 px-5 sm:px-8">
        {links.map(({ href, label, Icon }) => <Link key={href} href={href} aria-current={active === href ? 'page' : undefined}
          className={`flex min-h-12 items-center gap-2 border-b-2 py-3 text-sm font-medium ${active === href ? 'border-teal-700 text-teal-800' : 'border-transparent text-zinc-600 hover:text-zinc-950'}`}>
          <Icon className="size-4 shrink-0" aria-hidden="true" />{label}
        </Link>)}
      </nav>
    </header>
    <main id="workspace-content" tabIndex={-1} className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
      <p className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-500"><BadgeCheck className="size-4 text-teal-700" aria-hidden="true" />{roleLabels[user.role]}</p>
      {children}
    </main>
  </div>;
}
export function AccountDetails({ user }: { user: UserDTO }) {
  return <section aria-labelledby="account-heading" className="mt-9 max-w-2xl">
    <h2 id="account-heading" className="border-b border-zinc-200 pb-4 text-base font-semibold">Account</h2>
    <dl className="divide-y divide-zinc-100 text-sm">
      <div className="grid gap-2 py-5 sm:grid-cols-[140px_minmax(0,1fr)]"><dt className="text-zinc-500">Email address</dt><dd className="min-w-0 wrap-anywhere font-medium">{user.email}</dd></div>
      <div className="grid gap-2 py-5 sm:grid-cols-[140px_minmax(0,1fr)]"><dt className="text-zinc-500">Role</dt><dd>{roleLabels[user.role]}</dd></div>
      <div className="grid gap-2 py-5 sm:grid-cols-[140px_minmax(0,1fr)]"><dt className="text-zinc-500">Member since</dt><dd>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(user.createdAt))}</dd></div>
    </dl>
  </section>;
}
