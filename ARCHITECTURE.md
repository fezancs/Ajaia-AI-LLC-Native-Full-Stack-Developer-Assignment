# Architecture note

## What I prioritized, and why

The brief asks for a coherent product slice, not breadth. I spent the time on the path a reviewer
will actually walk: create a document, format it, come back to it, bring a file in, share it, and
see it from the other person's side. Three things got extra depth because they are where a small
editor usually breaks:

1. **Not losing work.** Autosave with a visible status, an immediate save when you leave the page,
   and conflict detection when two people edit the same document.
2. **Access rules that hold on the server.** Every read and write goes through one function that
   decides the caller's role. The UI hides what you cannot do, but it is never the only guard.
3. **A testable build.** One process, one SQLite file, seeded accounts, no paid services.

Everything else (comments, history, export, live cursors, real accounts) was cut on purpose.

## Stack

| Choice | Why |
| --- | --- |
| **Next.js (App Router), TypeScript** | UI and API in one codebase and one deploy. Pages render on the server with the user's data, so there are no loading spinners on first paint. |
| **SQLite (better-sqlite3)** | Zero setup for reviewers and a real relational model for ownership and shares. Synchronous calls keep the data code simple. The cost is a single instance and the need for a persistent disk. |
| **Tiptap (ProseMirror)** | A reliable rich-text core with exactly the formatting the brief asks for. I built only a small toolbar on top. |
| **Vitest** | Fast unit tests against an in-memory database. |

## Data model

```
users      (id, name, email)
documents  (id, title, content, version, owner_id, created_at, updated_at)
shares     (document_id, user_id, role: 'viewer' | 'editor', created_at)   PK (document_id, user_id)
```

A document has exactly one owner. A share row gives one other user a role. Deleting a document
removes its shares.

## Access control

`lib/documents.ts` is the only module that touches documents, and `getRole()` is the single source
of truth: `owner`, `editor`, `viewer` or nothing.

| Action | Owner | Editor | Viewer | Anyone else |
| --- | --- | --- | --- | --- |
| Read | yes | yes | yes | 404 |
| Edit content, rename | yes | yes | 403 | 404 |
| Share, change role, remove access, delete | yes | 403 | 403 | 404 |

People without access get **404, not 403**, so a document's existence is not revealed by guessing
its URL. Route handlers stay thin: authenticate, call the function, translate errors to JSON.

## Content storage

Content is stored as **HTML limited to an allow-list** (paragraphs, headings 1 to 3, bold, italic,
underline, lists, links, quotes, code). Everything that reaches the database, from the editor or
from an imported file, goes through the same sanitizer, so stored content can only contain what the
editor itself can produce. HTML was chosen over ProseMirror JSON because imports (Markdown and
`.docx` both convert naturally to HTML) and the editor then share one format and one sanitizer.

## Saving and conflicts

- The editor autosaves 800 ms after the last keystroke, and Ctrl/Cmd+S saves immediately.
- Saves are sent one at a time. Each content save carries the `version` the client last saw; the
  server bumps `version` on every content change and answers **409** if the client's copy is stale.
  The user then chooses "Load latest version" or "Overwrite with my version".
- Leaving the editor inside the app sends any unsaved text immediately. Closing or reloading the
  tab with unsaved text starts the save and shows the browser's "leave site?" confirmation.
- When the editor opens it checks the server for a newer version, because the browser's Back
  button can restore a page with older data.

This is **detection, not merging**. It is the cheapest design that guarantees nobody's work is
overwritten silently, and it leaves room for real-time sync later. Titles are last-write-wins.

## File import

`POST /api/import` accepts one `.txt`, `.md` or `.docx` file up to 2 MB and creates a new document
owned by the uploader, titled after the file. Text is escaped and split into paragraphs, Markdown
is rendered with `marked`, and Word files are converted with `mammoth`. The result is sanitized
like any other content. Unsupported, empty, oversized or corrupt files get a specific error. I
chose "file becomes a document" over attachments because it exercises the same editor, storage and
sharing path as everything else.

## Authentication (mocked on purpose)

The brief allows seeded accounts. The sign-in page lists three demo users; choosing one sets an
HTTP-only cookie containing the user id **signed with HMAC**, so the server never trusts an id the
client could edit. There are no passwords. Replacing this with real authentication only changes
`lib/auth.ts`; the access rules do not depend on how the user was identified.

## API

| Method and path | Purpose |
| --- | --- |
| `GET /api/documents` | Documents I own and documents shared with me |
| `POST /api/documents` | Create a document |
| `GET / PATCH / DELETE /api/documents/:id` | Read, update (title, content, optional `baseVersion`), delete |
| `GET / POST /api/documents/:id/shares` | List shares, grant or change a role |
| `DELETE /api/documents/:id/shares?userId=` | Remove someone's access |
| `POST /api/import` | Upload a file and create a document from it |

## Tradeoffs and known limits

- **No live collaboration.** Other people's edits appear after a reload. Conflicts are detected,
  not merged, and each save replaces the whole document.
- **Single instance.** SQLite on a local disk means one server process. Moving to Postgres is
  contained in `lib/db.ts` and `lib/documents.ts`.
- **Demo sign-in.** Anyone who can open the site can act as any seeded user.
- **Import fidelity.** Images, tables and fonts or colours in imported files are dropped.
- **Sharing targets.** You can share only with existing (seeded) users; there are no email invites.
- **Very large documents.** Saving on tab close relies on a browser feature limited to about
  64 KB per request; larger documents rely on the confirmation prompt to finish saving.

## What I would build next

1. Presence and live refresh (polling first, then WebSocket or a CRDT if real co-editing is needed).
2. Version history and restore, using the existing version counter.
3. Real accounts and invitations by email.
4. Export to Markdown and PDF.
