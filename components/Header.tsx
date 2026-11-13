import Link from 'next/link';
import { signOut } from '@/app/actions';

export default function Header({ user }: { user: { name: string; email: string } }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand">Ajaia Docs</Link>
      <div className="topbar-user">
        <span className="avatar small">{user.name[0]}</span>
        <span className="topbar-name">{user.name}</span>
        <form action={signOut}>
          <button type="submit" className="btn">Switch user</button>
        </form>
      </div>
    </header>
  );
}
