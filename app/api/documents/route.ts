import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createDocument, listDocuments } from '@/lib/documents';
import { requireUser, route } from '@/lib/http';

export const GET = route(async () => {
  const user = await requireUser();
  return NextResponse.json(listDocuments(getDb(), user.id));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  // Body is optional: an empty POST creates "Untitled document".
  const body = await req.json().catch(() => ({}));
  const doc = createDocument(getDb(), user.id, body && typeof body === 'object' ? body : {});
  return NextResponse.json({ document: doc }, { status: 201 });
});
