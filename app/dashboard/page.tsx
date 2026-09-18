import { requireUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function Dashboard() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect('/login');
  }

  return <DashboardClient user={user} />;
}
