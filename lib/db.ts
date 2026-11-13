import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS documents (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  version    INTEGER NOT NULL DEFAULT 1, -- bumped on every content save (conflict detection)
  owner_id   TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shares (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  created_at  TEXT NOT NULL,
  PRIMARY KEY (document_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id);
`;

export const SEED_USERS = [
  { id: 'u_alice', name: 'Alice Chen', email: 'alice@ajaia.test' },
  { id: 'u_bob', name: 'Bob Martinez', email: 'bob@ajaia.test' },
  { id: 'u_carol', name: 'Carol Singh', email: 'carol@ajaia.test' },
];

const WELCOME_HTML = `
<h1>Welcome to Ajaia Docs</h1>
<p>This document is owned by <strong>Alice</strong> and shared with <strong>Bob</strong> as an editor. Carol cannot see it.</p>
<h2>Things to try</h2>
<ul>
  <li>Format text with <strong>bold</strong>, <em>italic</em> and <u>underline</u></li>
  <li>Switch user (top right) to see the owned / shared distinction</li>
  <li>Import a .txt, .md or .docx file from the dashboard</li>
</ul>
`.trim();

function seed(db: DB) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  if (count.n > 0) return;
  const now = new Date().toISOString();
  const insertUser = db.prepare('INSERT INTO users (id, name, email) VALUES (?, ?, ?)');
  db.transaction(() => {
    for (const u of SEED_USERS) insertUser.run(u.id, u.name, u.email);
    db.prepare(
      'INSERT INTO documents (id, title, content, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('welcome', 'Welcome to Ajaia Docs', WELCOME_HTML, 'u_alice', now, now);
    db.prepare(
      'INSERT INTO shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)'
    ).run('welcome', 'u_bob', 'editor', now);
  })();
}

/** Open (and if needed create, migrate and seed) a database. Use ":memory:" in tests. */
export function createDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  seed(db);
  return db;
}

// One connection per process; cached on globalThis so dev hot-reload does not reopen it.
const globalForDb = globalThis as unknown as { __ajaiaDb?: DB };

/**
 * Where the SQLite file lives: DATABASE_PATH if set, otherwise a Railway volume
 * if one is attached (Railway sets RAILWAY_VOLUME_MOUNT_PATH), otherwise ./data.
 */
export function resolveDbPath(env: Record<string, string | undefined> = process.env): string {
  if (env.DATABASE_PATH) return env.DATABASE_PATH;
  if (env.RAILWAY_VOLUME_MOUNT_PATH) return path.join(env.RAILWAY_VOLUME_MOUNT_PATH, 'app.db');
  return './data/app.db';
}

export function getDb(): DB {
  if (!globalForDb.__ajaiaDb) globalForDb.__ajaiaDb = createDb(resolveDbPath());
  return globalForDb.__ajaiaDb;
}
