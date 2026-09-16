import { redirect } from 'next/navigation';
import { roleHome } from '@lms/shared';
import { requireUser } from '@/lib/session';

export default async function Home() { redirect(roleHome((await requireUser()).role)); }
