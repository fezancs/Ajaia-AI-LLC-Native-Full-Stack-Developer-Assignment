import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createDocument } from '@/lib/documents';
import { AppError } from '@/lib/errors';
import { requireUser, route } from '@/lib/http';
import { convertUpload, MAX_UPLOAD_BYTES } from '@/lib/importFile';

/** Upload a .txt, .md or .docx file and turn it into a new editable document. */
export const POST = route(async (req) => {
  const user = await requireUser();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError(400, 'Expected a file upload.');
  }
  const file = form.get('file');
  if (!(file instanceof File)) throw new AppError(400, 'No file was uploaded.');
  if (file.size > MAX_UPLOAD_BYTES) throw new AppError(413, 'File is too large (max 2 MB).');

  const converted = await convertUpload(file.name, Buffer.from(await file.arrayBuffer()));
  const doc = createDocument(getDb(), user.id, converted);
  return NextResponse.json({ document: doc }, { status: 201 });
});
