'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';

interface Owned { id: string; title: string; updated_at: string; share_count: number }
interface Shared { id: string; title: string; updated_at: string; role: 'viewer' | 'editor'; owner_name: string }

/**
 * The server and the browser can be in different time zones, so formatting a date
 * during server rendering causes a hydration mismatch. Render a neutral date
 * first, then switch to the viewer's local format once mounted.
 */
function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState(iso.slice(0, 10));
  useEffect(() => {
    setText(new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
  }, [iso]);
  return <time dateTime={iso}>{text}</time>;
}

export default function Dashboard({ owned, shared }: { owned: Owned[]; shared: Shared[] }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | 'create' | 'import'>(null);
  const [error, setError] = useState<string | null>(null);

  // The browser's Back button restores this page from the router cache. Refresh the
  // list on mount so titles, edit times and sharing changes are never stale.
  useEffect(() => {
    router.refresh();
  }, [router]);

  async function createDoc() {
    setBusy('create');
    setError(null);
    try {
      const { document } = await api<{ document: { id: string } }>('/api/documents', { method: 'POST' });
      router.push(`/doc/${document.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function importFile(file: File) {
    setBusy('import');
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const { document } = await api<{ document: { id: string } }>('/api/import', { method: 'POST', body: form });
      router.push(`/doc/${document.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function deleteDoc(doc: Owned) {
    if (!window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await api(`/api/documents/${doc.id}`, { method: 'DELETE' });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <div className="actions">
        <button className="btn primary" onClick={createDoc} disabled={busy !== null}>
          {busy === 'create' ? 'Creating…' : '+ New document'}
        </button>
        <button className="btn" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
          {busy === 'import' ? 'Importing…' : 'Import file'}
        </button>
        <span className="muted hint">Import creates a new document from a .txt, .md or .docx file (max 2 MB).</span>
        <input
          ref={fileInput}
          type="file"
          accept=".txt,.md,.docx"
          hidden
          aria-label="Import file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importFile(file);
          }}
        />
      </div>

      {error && <p className="error-banner" role="alert">{error}</p>}

      <section>
        <h2>My documents</h2>
        {owned.length === 0 ? (
          <p className="empty">You have no documents yet. Create one or import a file to get started.</p>
        ) : (
          <ul className="doc-list">
            {owned.map((d) => (
              <li key={d.id} className="doc-row">
                <Link href={`/doc/${d.id}`} className="doc-link">
                  <span className="doc-title">{d.title}</span>
                  <span className="muted">Edited <LocalTime iso={d.updated_at} /></span>
                </Link>
                <span className="badge owner">Owner</span>
                {d.share_count > 0 && (
                  <span className="badge">Shared with {d.share_count}</span>
                )}
                <button className="btn danger" onClick={() => deleteDoc(d)} aria-label={`Delete ${d.title}`}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Shared with me</h2>
        {shared.length === 0 ? (
          <p className="empty">Nothing has been shared with you yet.</p>
        ) : (
          <ul className="doc-list">
            {shared.map((d) => (
              <li key={d.id} className="doc-row">
                <Link href={`/doc/${d.id}`} className="doc-link">
                  <span className="doc-title">{d.title}</span>
                  <span className="muted">Owned by {d.owner_name} · Edited <LocalTime iso={d.updated_at} /></span>
                </Link>
                <span className="badge shared">{d.role === 'editor' ? 'Can edit' : 'View only'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
