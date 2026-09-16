import { redirect } from 'next/navigation';
import { roleHome } from '@lms/shared';
import { requireRoles } from '@/lib/session';

export default async function DashboardPage() {
  const user = await requireRoles(['ADMIN', 'SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION']);
  redirect(roleHome(user.role));
}
