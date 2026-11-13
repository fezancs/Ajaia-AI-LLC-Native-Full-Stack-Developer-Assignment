'use client';

import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, jsonBody } from '@/lib/client';
import ShareDialog from './ShareDialog';

type Role = 'owner' | 'editor' | 'viewer';
type SaveState = 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict';
interface User { id: string; name: string; email: string }

const AUTOSAVE_DELAY_MS = 800;

// Browsers cap the body of a `keepalive` request at 64 KiB.
const KEEPALIVE_MAX_BYTES = 60_000;

/** PATCH request options. Small bodies use `keepalive` so the save survives the tab closing. */
function patchInit(body: object): RequestInit {
  const init = jsonBody('PATCH', body);
  const bytes = new TextEncoder().encode(init.body as string).length;
  return bytes <= KEEPALIVE_MAX_BYTES ? { ...init, keepalive: true } : init;
}

const STATUS_TEXT: Record<SaveState, string> = {
  saved: 'All changes saved',
  unsaved: 'Unsaved changes…',
  saving: 'Saving…',
  error: 'Not saved',
  conflict: 'Not saved',
};

function ToolbarButton({
  label, title, active, onClick,
}: { label: React.ReactNode; title: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`tool${active ? ' active' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      // Keep the text selection in the editor when clicking a toolbar button.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const chain = () => editor.chain().focus();
  const blockType = editor.isActive('heading', { level: 1 }) ? 'h1'
    : editor.isActive('heading', { level: 2 }) ? 'h2'
    : editor.isActive('heading', { level: 3 }) ? 'h3'
    : 'p';

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <select
        value={blockType}
        aria-label="Text style"
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'p') chain().setParagraph().run();
          else chain().setHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run();
        }}
      >
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <span className="divider" />
      <ToolbarButton label={<b>B</b>} title="Bold (Ctrl+B)" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()} />
      <ToolbarButton label={<i>I</i>} title="Italic (Ctrl+I)" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()} />
      <ToolbarButton label={<u>U</u>} title="Underline (Ctrl+U)" active={editor.isActive('underline')} onClick={() => chain().toggleUnderline().run()} />
      <span className="divider" />
      <ToolbarButton label="• List" title="Bulleted list" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()} />
      <ToolbarButton label="1. List" title="Numbered list" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()} />
      <span className="divider" />
      <ToolbarButton label="↶" title="Undo (Ctrl+Z)" onClick={() => chain().undo().run()} />
      <ToolbarButton label="↷" title="Redo (Ctrl+Shift+Z)" onClick={() => chain().redo().run()} />
    </div>
  );
}

export default function DocEditor({
  doc, role, ownerName, shareableUsers,
}: {
  doc: { id: string; title: string; content: string; version: number };
  role: Role;
  ownerName: string;
  shareableUsers: User[];
}) {
  const canEdit = role !== 'viewer';
  const docUrl = `/api/documents/${doc.id}`;

  const [title, setTitle] = useState(doc.title);
  const savedTitle = useRef(doc.title);
  const [titleSaving, setTitleSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  // Autosave bookkeeping lives in refs so callbacks never read stale values.
  const pending = useRef<string | null>(null); // content waiting to be saved (null = nothing)
  const version = useRef(doc.version);         // content version the server had when we last synced
  const inFlight = useRef(false);              // a save request is running
  const conflicted = useRef(false);            // a conflict is waiting for the user's decision
  const reloading = useRef(false);             // the user chose "Load latest version"
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Save pending content. Saves run one at a time so each carries the version
   * returned by the previous one; anything typed meanwhile is saved right after.
   */
  const save = useCallback(async (opts: { overwrite?: boolean } = {}) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (inFlight.current || pending.current === null) return;
    if (conflicted.current && !opts.overwrite) return;

    const content = pending.current;
    pending.current = null;
    inFlight.current = true;
    setSaveState('saving');
    let ok = false;
    try {
      const body = opts.overwrite ? { content } : { content, baseVersion: version.current };
      const res = await api<{ document: { version: number } }>(docUrl, patchInit(body));
      version.current = res.document.version;
      conflicted.current = false;
      ok = true;
      setError(null);
    } catch (e) {
      if (pending.current === null) pending.current = content; // keep it so it can be retried
      if (e instanceof ApiError && e.status === 409) {
        conflicted.current = true;
        setSaveState('conflict');
      } else {
        setSaveState('error');
        setError((e as Error).message);
      }
    } finally {
      inFlight.current = false;
    }
    if (!ok) return;
    if (pending.current === null) {
      setSaveState('saved');
    } else {
      // More was typed during the request. If the user is still typing, the
      // debounce timer will save it; otherwise save it now.
      setSaveState('unsaved');
      if (timer.current === null) void save();
    }
  }, [docUrl]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Off on purpose: it appends an empty paragraph as soon as you click into a document
        // that ends with a list, which would save (and bump the version) without any real edit.
        trailingNode: false,
      }),
      Placeholder.configure({ placeholder: 'Start typing…' }),
    ],
    content: doc.content,
    editable: canEdit,
    autofocus: canEdit && doc.content === '' ? 'end' : false,
    immediatelyRender: false, // required for Next.js server rendering
    shouldRerenderOnTransaction: true, // keeps toolbar active states in sync
    editorProps: { attributes: { class: 'doc-content', 'aria-label': 'Document content' } },
    onUpdate: ({ editor }) => {
      if (!canEdit) return; // viewers never save
      pending.current = editor.getHTML();
      if (conflicted.current) return; // wait for the user to resolve the conflict
      setSaveState('unsaved');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => save(), AUTOSAVE_DELAY_MS);
    },
  });

  // The router can restore this page from its cache (e.g. the browser's Back button)
  // with props from an earlier render. Check with the server once the editor is ready
  // and adopt anything newer, so a cached copy is never shown or saved over newer work.
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    api<{ document: { title: string; content: string; version: number } }>(docUrl)
      .then(({ document: latest }) => {
        if (cancelled) return;
        if (latest.title !== savedTitle.current) {
          savedTitle.current = latest.title;
          setTitle(latest.title);
        }
        const untouched = pending.current === null && !inFlight.current;
        if (latest.version !== version.current && untouched) {
          version.current = latest.version;
          editor.chain().setMeta('addToHistory', false).setContent(latest.content, { emitUpdate: false }).run();
        }
      })
      .catch(() => { /* best effort: a real problem will surface on the next save */ });
    return () => { cancelled = true; };
  }, [editor, docUrl]);

  // Ctrl/Cmd+S saves immediately instead of opening the browser's "Save page" dialog.
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit, save]);

  // Do not lose the last few keystrokes when leaving the page.
  useEffect(() => {
    if (!canEdit) return;
    // Fire-and-forget: send whatever is still unsaved because this page is going away.
    const sendPending = () => {
      if (pending.current === null || conflicted.current) return;
      // While our own save is still in flight the new version is unknown, so skip the check.
      const body = inFlight.current
        ? { content: pending.current }
        : { content: pending.current, baseVersion: version.current };
      fetch(docUrl, patchInit(body));
      pending.current = null;
    };
    // Closing or reloading the tab with unsaved work: start the save right away and ask the
    // browser to confirm, which gives the request time to reach the server before the page goes.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (reloading.current) return;
      if (pending.current === null && !inFlight.current) return;
      save();
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', sendPending);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', sendPending);
      if (timer.current) clearTimeout(timer.current);
      sendPending(); // in-app navigation, e.g. back to the dashboard
    };
  }, [canEdit, docUrl, save]);

  async function saveTitle() {
    const next = title.trim();
    if (!next) {
      setTitle(savedTitle.current); // empty titles are not allowed; restore the last one
      return;
    }
    setTitle(next);
    if (next === savedTitle.current) return;
    setTitleSaving(true);
    try {
      await api(docUrl, jsonBody('PATCH', { title: next }));
      savedTitle.current = next;
      setError(null);
    } catch (e) {
      setError(`Could not rename the document. ${(e as Error).message}`);
    } finally {
      setTitleSaving(false);
    }
  }

  return (
    <div className="editor-page">
      <div className="doc-head">
        <Link href="/" className="back" aria-label="Back to documents">← Documents</Link>
        <input
          className="title-input"
          value={title}
          readOnly={!canEdit}
          maxLength={200}
          aria-label="Document title"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <div className="doc-meta">
          {role === 'owner' ? (
            <span className="badge owner">Owner</span>
          ) : (
            <span className="badge shared">
              Shared by {ownerName} · {role === 'editor' ? 'Can edit' : 'View only'}
            </span>
          )}
          {canEdit && (
            <span className={`save-state ${saveState}`} role="status">
              {titleSaving ? 'Saving…' : STATUS_TEXT[saveState]}
            </span>
          )}
          {role === 'owner' && (
            <button className="btn primary" onClick={() => setSharing(true)}>Share</button>
          )}
        </div>
      </div>

      {saveState === 'conflict' ? (
        <div className="error-banner" role="alert">
          This document was changed somewhere else after you opened it, so your latest edits are not saved yet.
          <div className="banner-actions">
            <button
              className="btn"
              onClick={() => {
                reloading.current = true; // skip the "unsaved changes" prompt: discarding is the point
                window.location.reload();
              }}
            >
              Load latest version
            </button>
            <button className="btn" onClick={() => save({ overwrite: true })}>Overwrite with my version</button>
          </div>
        </div>
      ) : error ? (
        <div className="error-banner" role="alert">
          {error}
          {saveState === 'error' && (
            <div className="banner-actions">
              <button className="btn" onClick={() => save()}>Retry</button>
            </div>
          )}
        </div>
      ) : null}
      {!canEdit && <p className="info-banner">You have view-only access to this document.</p>}

      {canEdit && editor && <Toolbar editor={editor} />}
      <div className="page">
        {editor ? <EditorContent editor={editor} /> : <p className="muted loading">Loading editor…</p>}
      </div>

      {sharing && <ShareDialog docId={doc.id} users={shareableUsers} onClose={() => setSharing(false)} />}
    </div>
  );
}
