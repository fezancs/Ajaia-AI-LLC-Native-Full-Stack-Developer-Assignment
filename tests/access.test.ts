import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type DB } from '../lib/db';
import {
  createDocument, deleteDocument, getDocument, getRole, listDocuments,
  listShares, shareDocument, unshareDocument, updateDocument,
} from '../lib/documents';

const ALICE = 'u_alice';
const BOB = 'u_bob';
const CAROL = 'u_carol';

let db: DB;
let docId: string;

beforeEach(() => {
  db = createDb(':memory:');
  docId = createDocument(db, ALICE, { title: 'Roadmap', content: '<p>Q1 plan</p>' }).id;
});

const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { status?: number }).status;
  }
  return 'no error';
};

describe('document access', () => {
  it('lets the owner read, edit and delete', () => {
    expect(getRole(db, docId, ALICE)).toBe('owner');
    expect(updateDocument(db, docId, ALICE, { title: 'Roadmap v2' }).title).toBe('Roadmap v2');
    deleteDocument(db, docId, ALICE);
    expect(getRole(db, docId, ALICE)).toBeNull();
  });

  it('hides unshared documents from other users (404, not 403)', () => {
    expect(status(() => getDocument(db, docId, BOB))).toBe(404);
    expect(status(() => updateDocument(db, docId, BOB, { content: '<p>hacked</p>' }))).toBe(404);
    expect(listDocuments(db, BOB).shared.map((d) => d.id)).not.toContain(docId);
  });

  it('gives an editor read and write access but not owner powers', () => {
    shareDocument(db, docId, ALICE, { email: 'bob@ajaia.test', role: 'editor' });
    expect(getDocument(db, docId, BOB).role).toBe('editor');
    expect(updateDocument(db, docId, BOB, { content: '<p>Bob was here</p>' }).content).toContain('Bob was here');
    expect(status(() => deleteDocument(db, docId, BOB))).toBe(403);
    expect(status(() => shareDocument(db, docId, BOB, { email: 'carol@ajaia.test' }))).toBe(403);
    expect(status(() => listShares(db, docId, BOB))).toBe(403);
  });

  it('gives a viewer read-only access', () => {
    shareDocument(db, docId, ALICE, { email: 'bob@ajaia.test', role: 'viewer' });
    expect(getDocument(db, docId, BOB).document.title).toBe('Roadmap');
    expect(status(() => updateDocument(db, docId, BOB, { title: 'Nope' }))).toBe(403);
  });

  it('separates owned and shared documents in listings', () => {
    shareDocument(db, docId, ALICE, { email: 'bob@ajaia.test', role: 'viewer' });
    const alice = listDocuments(db, ALICE);
    expect(alice.owned.find((d) => d.id === docId)?.share_count).toBe(1);
    expect(alice.shared).toHaveLength(0);

    const bob = listDocuments(db, BOB);
    expect(bob.owned.map((d) => d.id)).not.toContain(docId);
    expect(bob.shared.find((d) => d.id === docId)).toMatchObject({ role: 'viewer', owner_name: 'Alice Chen' });
    expect(listDocuments(db, CAROL).shared).toHaveLength(0);
  });

  it('changes a role when re-sharing and revokes access on unshare', () => {
    shareDocument(db, docId, ALICE, { email: 'bob@ajaia.test', role: 'viewer' });
    shareDocument(db, docId, ALICE, { email: 'bob@ajaia.test', role: 'editor' });
    expect(listShares(db, docId, ALICE)).toHaveLength(1);
    expect(getRole(db, docId, BOB)).toBe('editor');

    unshareDocument(db, docId, ALICE, BOB);
    expect(getRole(db, docId, BOB)).toBeNull();
  });

  it('rejects invalid share requests', () => {
    expect(status(() => shareDocument(db, docId, ALICE, { email: 'nobody@ajaia.test' }))).toBe(404);
    expect(status(() => shareDocument(db, docId, ALICE, { email: 'alice@ajaia.test' }))).toBe(400);
    expect(status(() => shareDocument(db, docId, ALICE, { email: 'bob@ajaia.test', role: 'admin' }))).toBe(400);
    expect(status(() => shareDocument(db, docId, ALICE, {}))).toBe(400);
  });
});

describe('document validation', () => {
  it('rejects empty and oversized titles', () => {
    expect(status(() => updateDocument(db, docId, ALICE, { title: '   ' }))).toBe(400);
    expect(status(() => updateDocument(db, docId, ALICE, { title: 'x'.repeat(201) }))).toBe(400);
    expect(status(() => updateDocument(db, docId, ALICE, {}))).toBe(400);
  });

  it('strips unsafe HTML but keeps supported formatting', () => {
    const saved = updateDocument(db, docId, ALICE, {
      content: '<h2>Plan</h2><p><strong>bold</strong> <em>it</em> <u>under</u></p><ul><li>one</li></ul>' +
        '<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a>',
    }).content;
    expect(saved).toContain('<h2>Plan</h2>');
    expect(saved).toContain('<strong>bold</strong>');
    expect(saved).toContain('<u>under</u>');
    expect(saved).toContain('<ul><li>one</li></ul>');
    expect(saved).not.toMatch(/script|onerror|javascript:|<img/);
  });
});

describe('conflict detection (optimistic concurrency)', () => {
  it('bumps the version on content saves only', () => {
    expect(getDocument(db, docId, ALICE).document.version).toBe(1);
    expect(updateDocument(db, docId, ALICE, { title: 'Renamed' }).version).toBe(1);
    expect(updateDocument(db, docId, ALICE, { content: '<p>v2</p>', baseVersion: 1 }).version).toBe(2);
  });

  it('rejects a save based on a stale version instead of overwriting newer work', () => {
    shareDocument(db, docId, ALICE, { email: 'bob@ajaia.test', role: 'editor' });
    // Alice and Bob both loaded version 1. Bob saves first.
    updateDocument(db, docId, BOB, { content: '<p>Bob</p>', baseVersion: 1 });
    // Alice's save is still based on version 1.
    expect(status(() => updateDocument(db, docId, ALICE, { content: '<p>Alice</p>', baseVersion: 1 }))).toBe(409);
    expect(getDocument(db, docId, ALICE).document.content).toBe('<p>Bob</p>');
    // After reloading (version 2) her save goes through.
    expect(updateDocument(db, docId, ALICE, { content: '<p>Alice</p>', baseVersion: 2 }).version).toBe(3);
  });

  it('allows an explicit overwrite (no baseVersion) and validates baseVersion', () => {
    updateDocument(db, docId, ALICE, { content: '<p>v2</p>', baseVersion: 1 });
    expect(updateDocument(db, docId, ALICE, { content: '<p>mine</p>' }).content).toBe('<p>mine</p>');
    expect(status(() => updateDocument(db, docId, ALICE, { content: '<p>x</p>', baseVersion: 'one' }))).toBe(400);
  });

  it('applies nothing when part of a combined update is invalid', () => {
    expect(status(() => updateDocument(db, docId, ALICE, { title: '', content: '<p>new</p>' }))).toBe(400);
    expect(getDocument(db, docId, ALICE).document.content).toBe('<p>Q1 plan</p>');
  });
});
