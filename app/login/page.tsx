import { redirect } from 'next/navigation';
import { signIn } from '@/app/actions';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { listUsers } from '@/lib/documents';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCurrentUser()) redirect('/');
  const users = listUsers(getDb());
  const { error } = await searchParams;

  return (
    <main className="login">
      <div className="login-card">
        <h1>Ajaia Docs</h1>
        <p className="muted">
          Demo sign-in: choose a seeded account. No password is needed. Open a second browser
          (or a private window) as another user to try sharing.
        </p>
        {error && <p className="error-banner">That account does not exist. Please choose one below.</p>}
        <form action={signIn} className="login-users">
          {users.map((u) => (
            <button key={u.id} type="submit" name="userId" value={u.id} className="login-user">
              <span className="avatar">{u.name[0]}</span>
              <span>
                <strong>{u.name}</strong>
                <br />
                <span className="muted">{u.email}</span>
              </span>
            </button>
          ))}
        </form>
      </div>
    </main>
  );
}
