import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { listShares, shareDocument, unshareDocument } from '@/lib/documents';
import { readJson, requireUser, route } from '@/lib/http';

export const GET = route(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return NextResponse.json({ shares: listShares(getDb(), id, user.id) });
});

export const POST = route(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await readJson(req);
  const share = shareDocument(getDb(), id, user.id, { email: body.email, role: body.role });
  return NextResponse.json({ share }, { status: 201 });
});

export const DELETE = route(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  // The user to remove is a query parameter: DELETE bodies are not reliably forwarded by proxies.
  unshareDocument(getDb(), id, user.id, new URL(req.url).searchParams.get('userId'));
  return NextResponse.json({ ok: true });
});
