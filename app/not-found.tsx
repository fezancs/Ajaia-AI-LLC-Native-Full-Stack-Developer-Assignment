import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="login">
      <div className="login-card">
        <h1>Document not found</h1>
        <p className="muted">
          It may have been deleted, or it has not been shared with the account you are signed in as.
        </p>
        <Link href="/" className="btn primary">Back to documents</Link>
      </div>
    </main>
  );
}
