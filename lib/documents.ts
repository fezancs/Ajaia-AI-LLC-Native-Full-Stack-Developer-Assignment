import { randomUUID } from 'node:crypto';
import type { DB } from './db';
import { AppError } from './errors';
import { sanitizeContent } from './sanitize';

export type Role = 'owner' | 'editor' | 'viewer';
export type ShareRole = Exclude<Role, 'owner'>;

export interface User { id: string; name: string; email: string }
export interface DocumentRecord {
  id: string; title: string; content: string; version: number;
  owner_id: string; created_at: string; updated_at: string;
}
export interface OwnedSummary { id: string; title: string; updated_at: string; share_count: number }
export interface SharedSummary { id: string; title: string; updated_at: string; role: ShareRole; owner_name: string }
export interface Share { user_id: string; name: string; email: string; role: ShareRole }

const MAX_TITLE = 200;
const MAX_CONTENT = 1_000_000; // characters of HTML

function cleanTitle(input: unknown): string {
  if (typeof input !== 'string') throw new AppError(400, 'Title must be text.');
  const title = input.trim();
  if (!title) throw new AppError(400, 'Title cannot be empty.');
  if (title.length > MAX_TITLE) throw new AppError(400, `Title must be ${MAX_TITLE} characters or fewer.`);
  return title;
}

function cleanContent(input: unknown): string {
  if (typeof input !== 'string') throw new AppError(400, 'Content must be text.');
  if (input.length > MAX_CONTENT) throw new AppError(413, 'Document is too large.');
  return sanitizeContent(input);
}

export function listUsers(db: DB): User[] {
  return db.prepare('SELECT id, name, email FROM users ORDER BY name').all() as User[];
}

export function getUser(db: DB, id: string): User | undefined {
  return db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(id) as User | undefined;
}

/** The single source of truth for access: what can this user do with this document? */
export function getRole(db: DB, docId: string, userId: string): Role | null {
  const doc = db.prepare('SELECT owner_id FROM documents WHERE id = ?').get(docId) as
    | { owner_id: string }
    | undefined;
  if (!doc) return null;
  if (doc.owner_id === userId) return 'owner';
  const share = db
    .prepare('SELECT role FROM shares WHERE document_id = ? AND user_id = ?')
    .get(docId, userId) as { role: ShareRole } | undefined;
  return share?.role ?? null;
}

/**
 * Returns the caller's role, or throws 404. Documents the caller cannot access
 * are reported as "not found" so their existence is not revealed.
 */
function requireRole(db: DB, docId: string, userId: string, allowed: Role[]): Role {
  const role = getRole(db, docId, userId);
  if (!role) throw new AppError(404, 'Document not found.');
  if (!allowed.includes(role)) {
    throw new AppError(403, 'You do not have permission to do that.');
  }
  return role;
}

export function listDocuments(db: DB, userId: string): { owned: OwnedSummary[]; shared: SharedSummary[] } {
  const owned = db
    .prepare(
      `SELECT d.id, d.title, d.updated_at,
              (SELECT COUNT(*) FROM shares s WHERE s.document_id = d.id) AS share_count
       FROM documents d WHERE d.owner_id = ? ORDER BY d.updated_at DESC`
    )
    .all(userId) as OwnedSummary[];
  const shared = db
    .prepare(
      `SELECT d.id, d.title, d.updated_at, s.role, u.name AS owner_name
       FROM shares s
       JOIN documents d ON d.id = s.document_id
       JOIN users u ON u.id = d.owner_id
       WHERE s.user_id = ? ORDER BY d.updated_at DESC`
    )
    .all(userId) as SharedSummary[];
  return { owned, shared };
}

export function createDocument(
  db: DB,
  userId: string,
  input: { title?: unknown; content?: unknown } = {}
): DocumentRecord {
  const title = input.title === undefined ? 'Untitled document' : cleanTitle(input.title);
  const content = input.content === undefined ? '' : cleanContent(input.content);
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO documents (id, title, content, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, title, content, userId, now, now);
  return { id, title, content, version: 1, owner_id: userId, created_at: now, updated_at: now };
}

export function getDocument(
  db: DB,
  docId: string,
  userId: string
): { document: DocumentRecord; role: Role; owner: User } {
  const role = requireRole(db, docId, userId, ['owner', 'editor', 'viewer']);
  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId) as DocumentRecord;
  const owner = getUser(db, document.owner_id)!;
  return { document, role, owner };
}

/**
 * Update title and/or content. Content saves may pass `baseVersion` (the content
 * version the client last loaded). If someone else has saved since then the
 * update is rejected with 409 instead of silently overwriting their work.
 */
export function updateDocument(
  db: DB,
  docId: string,
  userId: string,
  patch: { title?: unknown; content?: unknown; baseVersion?: unknown }
): DocumentRecord {
  requireRole(db, docId, userId, ['owner', 'editor']);
  if (patch.title === undefined && patch.content === undefined) {
    throw new AppError(400, 'Nothing to update.');
  }
  // Validate everything before writing anything.
  const title = patch.title === undefined ? undefined : cleanTitle(patch.title);
  const content = patch.content === undefined ? undefined : cleanContent(patch.content);
  if (patch.baseVersion !== undefined && !Number.isInteger(patch.baseVersion)) {
    throw new AppError(400, 'baseVersion must be a whole number.');
  }

  const now = new Date().toISOString();
  db.transaction(() => {
    if (content !== undefined) {
      if (patch.baseVersion !== undefined) {
        const current = db.prepare('SELECT version FROM documents WHERE id = ?').get(docId) as { version: number };
        if (current.version !== patch.baseVersion) {
          throw new AppError(409, 'This document was changed somewhere else after you opened it.');
        }
      }
      db.prepare('UPDATE documents SET content = ?, version = version + 1, updated_at = ? WHERE id = ?').run(content, now, docId);
    }
    if (title !== undefined) {
      db.prepare('UPDATE documents SET title = ?, updated_at = ? WHERE id = ?').run(title, now, docId);
    }
  })();
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(docId) as DocumentRecord;
}

export function deleteDocument(db: DB, docId: string, userId: string): void {
  requireRole(db, docId, userId, ['owner']);
  db.prepare('DELETE FROM documents WHERE id = ?').run(docId);
}

export function listShares(db: DB, docId: string, userId: string): Share[] {
  requireRole(db, docId, userId, ['owner']);
  return db
    .prepare(
      `SELECT s.user_id, u.name, u.email, s.role
       FROM shares s JOIN users u ON u.id = s.user_id
       WHERE s.document_id = ? ORDER BY u.name`
    )
    .all(docId) as Share[];
}

/** Grant (or change) another user's access. Only the owner can share. */
export function shareDocument(
  db: DB,
  docId: string,
  ownerId: string,
  input: { email?: unknown; role?: unknown }
): Share {
  requireRole(db, docId, ownerId, ['owner']);
  if (typeof input.email !== 'string' || !input.email.trim()) {
    throw new AppError(400, 'Choose a person to share with.');
  }
  const role = input.role ?? 'viewer';
  if (role !== 'viewer' && role !== 'editor') {
    throw new AppError(400, 'Role must be "viewer" or "editor".');
  }
  const target = db
    .prepare('SELECT id, name, email FROM users WHERE email = ?')
    .get(input.email.trim().toLowerCase()) as User | undefined;
  if (!target) throw new AppError(404, 'No user with that email.');
  if (target.id === ownerId) throw new AppError(400, 'You already own this document.');

  db.prepare(
    `INSERT INTO shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`
  ).run(docId, target.id, role, new Date().toISOString());
  return { user_id: target.id, name: target.name, email: target.email, role };
}

export function unshareDocument(db: DB, docId: string, ownerId: string, targetUserId: unknown): void {
  requireRole(db, docId, ownerId, ['owner']);
  if (typeof targetUserId !== 'string' || !targetUserId) throw new AppError(400, 'Missing user.');
  db.prepare('DELETE FROM shares WHERE document_id = ? AND user_id = ?').run(docId, targetUserId);
}
