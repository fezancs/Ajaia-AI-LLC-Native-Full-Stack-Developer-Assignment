import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb, resolveDbPath } from '../lib/db';
import { createDocument, getDocument, listUsers, shareDocument } from '../lib/documents';

describe('database', () => {
  it('seeds demo users and a shared welcome document exactly once', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ajaia-')), 'nested', 'app.db');
    const first = createDb(file);
    expect(listUsers(first).map((u) => u.email)).toEqual([
      'alice@ajaia.test', 'bob@ajaia.test', 'carol@ajaia.test',
    ]);
    expect(getDocument(first, 'welcome', 'u_bob').role).toBe('editor');
    first.close();

    const second = createDb(file); // reopening must not re-seed or duplicate
    expect(listUsers(second)).toHaveLength(3);
    second.close();
  });

  it('persists documents and shares across restarts', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ajaia-')), 'app.db');
    const before = createDb(file);
    const id = createDocument(before, 'u_alice', { title: 'Kept', content: '<h1>Hi</h1><p><strong>bold</strong></p>' }).id;
    shareDocument(before, id, 'u_alice', { email: 'carol@ajaia.test', role: 'viewer' });
    before.close();

    const after = createDb(file);
    const loaded = getDocument(after, id, 'u_carol');
    expect(loaded.role).toBe('viewer');
    expect(loaded.document.content).toBe('<h1>Hi</h1><p><strong>bold</strong></p>');
    after.close();
  });

  it('chooses the database location from the environment', () => {
    expect(resolveDbPath({ DATABASE_PATH: '/var/data/x.db', RAILWAY_VOLUME_MOUNT_PATH: '/data' })).toBe('/var/data/x.db');
    expect(resolveDbPath({ RAILWAY_VOLUME_MOUNT_PATH: '/data' })).toBe(path.join('/data', 'app.db'));
    expect(resolveDbPath({})).toBe('./data/app.db');
  });
});
