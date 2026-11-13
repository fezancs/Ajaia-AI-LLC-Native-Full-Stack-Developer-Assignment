'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { encodeSession, SESSION_COOKIE } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getUser } from '@/lib/documents';

export async function signIn(formData: FormData) {
  const userId = String(formData.get('userId') ?? '');
  if (!getUser(getDb(), userId)) redirect('/login?error=unknown-user');

  const isHttps = (await headers()).get('x-forwarded-proto') === 'https';
  (await cookies()).set(SESSION_COOKIE, encodeSession(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect('/');
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
