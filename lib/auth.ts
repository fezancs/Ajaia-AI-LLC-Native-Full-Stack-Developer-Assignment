import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getDb } from './db';
import { getUser, type User } from './documents';

/**
 * Mocked auth: reviewers pick a seeded user on the login page. The session is
 * a signed cookie holding the user id, so the server never trusts a bare id
 * from the client. There are no passwords by design (see ARCHITECTURE.md).
 */
export const SESSION_COOKIE = 'ajaia_session';
const SECRET = process.env.SESSION_SECRET ?? 'dev-only-secret-change-me';
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('SESSION_SECRET is not set: session cookies are signed with a public default. Set it in production.');
}

function sign(value: string): string {
  return createHmac('sha256', SECRET).update(value).digest('hex');
}

export function encodeSession(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function decodeSession(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(userId));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return userId;
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const userId = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  return getUser(getDb(), userId) ?? null;
}
