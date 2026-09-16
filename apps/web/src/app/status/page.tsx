import { requireUser } from '@/lib/session';
import { WorkspaceShell } from '@/components/workspace-shell';
import { ServiceStatus } from '@/components/service-status';

export default async function StatusPage() {
  const user = await requireUser();
  return <WorkspaceShell user={user} active="/status"><h1 className="text-2xl font-semibold">Service status</h1><ServiceStatus /></WorkspaceShell>;
}
