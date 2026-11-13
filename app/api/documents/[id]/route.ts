import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { deleteDocument, getDocument, updateDocument } from '@/lib/documents';
import { readJson, requireUser, route } from '@/lib/http';

export const GET = route(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return NextResponse.json(getDocument(getDb(), id, user.id));
});

export const PATCH = route(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await readJson(req);
  const document = updateDocument(getDb(), id, user.id, {
    title: body.title,
    content: body.content,
    baseVersion: body.baseVersion,
  });
  return NextResponse.json({ document });
});

export const DELETE = route(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  deleteDocument(getDb(), id, user.id);
  return NextResponse.json({ ok: true });
});
