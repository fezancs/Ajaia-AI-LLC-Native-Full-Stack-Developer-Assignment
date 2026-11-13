import { notFound, redirect } from 'next/navigation';
import DocEditor from '@/components/DocEditor';
import Header from '@/components/Header';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getDocument, listUsers } from '@/lib/documents';
import { AppError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const { id } = await params;

  let result;
  try {
    result = getDocument(getDb(), id, user.id);
  } catch (err) {
    if (err instanceof AppError) notFound();
    throw err;
  }
  const { document, role, owner } = result;
  // People the owner can share with: everyone except themselves.
  const others = role === 'owner' ? listUsers(getDb()).filter((u) => u.id !== user.id) : [];

  return (
    <>
      <Header user={user} />
      <DocEditor
        doc={{ id: document.id, title: document.title, content: document.content, version: document.version }}
        role={role}
        ownerName={owner.name}
        shareableUsers={others}
      />
    </>
  );
}
