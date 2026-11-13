'use client';

import { useEffect, useState } from 'react';
import { api, jsonBody } from '@/lib/client';

interface Share { user_id: string; name: string; email: string; role: 'viewer' | 'editor' }
interface User { id: string; name: string; email: string }

export default function ShareDialog({
  docId,
  users,
  onClose,
}: {
  docId: string;
  users: User[];
  onClose: () => void;
}) {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'viewer' | 'editor'>('editor');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ shares: Share[] }>(`/api/documents/${docId}/shares`)
      .then((d) => setShares(d.shares))
      .catch((e: Error) => setError(e.message));
  }, [docId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sharedIds = new Set((shares ?? []).map((s) => s.user_id));
  const candidates = users.filter((u) => !sharedIds.has(u.id));

  async function grant(targetEmail: string, targetRole: 'viewer' | 'editor') {
    setBusy(true);
    setError(null);
    try {
      const { share } = await api<{ share: Share }>(
        `/api/documents/${docId}/shares`,
        jsonBody('POST', { email: targetEmail, role: targetRole })
      );
      setShares((prev) => [...(prev ?? []).filter((s) => s.user_id !== share.user_id), share]);
      setEmail('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(userId: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/documents/${docId}/shares?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' });
      setShares((prev) => (prev ?? []).filter((s) => s.user_id !== userId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Share document" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Share document</h2>
          <button className="btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form
          className="share-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (email) grant(email, role);
          }}
        >
          <select value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Person">
            <option value="">Choose a person…</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.email}>{u.name} ({u.email})</option>
            ))}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value as 'viewer' | 'editor')} aria-label="Permission">
            <option value="editor">Can edit</option>
            <option value="viewer">View only</option>
          </select>
          <button className="btn primary" type="submit" disabled={!email || busy}>Share</button>
        </form>

        {error && <p className="error-banner" role="alert">{error}</p>}

        <h3>People with access</h3>
        {shares === null ? (
          <p className="muted">Loading…</p>
        ) : shares.length === 0 ? (
          <p className="muted">Only you can see this document.</p>
        ) : (
          <ul className="share-list">
            {shares.map((s) => (
              <li key={s.user_id}>
                <span className="avatar small">{s.name[0]}</span>
                <span className="share-name">
                  {s.name}
                  <br />
                  <span className="muted">{s.email}</span>
                </span>
                <select
                  value={s.role}
                  disabled={busy}
                  onChange={(e) => grant(s.email, e.target.value as 'viewer' | 'editor')}
                  aria-label={`Permission for ${s.name}`}
                >
                  <option value="editor">Can edit</option>
                  <option value="viewer">View only</option>
                </select>
                <button className="btn danger" disabled={busy} onClick={() => revoke(s.user_id)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
