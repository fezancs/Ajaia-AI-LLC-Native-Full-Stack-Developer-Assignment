import { redirect } from 'next/navigation';
import Dashboard from '@/components/Dashboard';
import Header from '@/components/Header';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { listDocuments } from '@/lib/documents';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const { owned, shared } = listDocuments(getDb(), user.id);

  return (
    <>
      <Header user={user} />
      <main className="container">
        <Dashboard owned={owned} shared={shared} />
      </main>
    </>
  );
}
