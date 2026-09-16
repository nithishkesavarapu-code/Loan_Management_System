import { notFound } from 'next/navigation';
import { dashboardModules, moduleLabels, moduleRoles, type DashboardModule } from '@lms/shared';
import { requireRoles, requireUser } from '@/lib/session';
import { AccountDetails, WorkspaceShell } from '@/components/workspace-shell';

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  await requireUser();
  const { module } = await params;
  if (!dashboardModules.some((value) => value === module)) notFound();
  const selected = module as DashboardModule;
  const user = await requireRoles(moduleRoles[selected]);
  return <WorkspaceShell user={user} active={`/dashboard/${selected}`}>
    <h1 className="text-2xl font-semibold">{moduleLabels[selected]}</h1><AccountDetails user={user} />
  </WorkspaceShell>;
}
