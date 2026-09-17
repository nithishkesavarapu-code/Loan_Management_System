import { requireRoles } from '@/lib/session';
import { AccountDetails, WorkspaceShell } from '@/components/workspace-shell';
import { applicationPageSchema, loanPageSchema } from '@lms/shared';
import { serverApi } from '@/lib/api-server';
import { ApplicationList } from '@/features/applications/application-list';
import { LoanList } from '@/features/loans/loan-list';

export default async function BorrowerPage() {
  const user = await requireRoles(['BORROWER']);
  const [applications, loans] = await Promise.all([
    serverApi(applicationPageSchema, '/borrower/applications'),
    serverApi(loanPageSchema, '/borrower/loans'),
  ]);
  return <WorkspaceShell user={user} active="/borrower"><h1 className="text-2xl font-semibold">Borrower portal</h1><ApplicationList initial={applications} /><LoanList initial={loans} /><AccountDetails user={user} /></WorkspaceShell>;
}
