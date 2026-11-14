# Evaluation guide

How this submission maps to the brief: each core requirement, the optional stretch item that was
built, and each deliverable, with where it lives and the quickest way to check it. "Tour" refers to
the five-minute tour in [`README.md`](README.md); the demo accounts are listed there too.

## Core product

| Requirement | What was built | Where in the code | How to check |
| --- | --- | --- | --- |
| Create and edit documents | Create, rename, edit and delete (owner only); autosave with a visible status; Ctrl/Cmd+S saves at once | `components/DocEditor.tsx`, `app/api/documents/` | Tour 1 and 2 |
| Rich-text formatting | Bold, italic, underline, headings 1 to 3, bulleted and numbered lists, undo and redo | `components/DocEditor.tsx` (Tiptap) | Tour 1; reload and the formatting is still there |
| File upload | A `.txt`, `.md` or `.docx` file up to 2 MB becomes a new editable document; other types, empty, oversized and corrupt files get a specific error | `lib/importFile.ts`, `app/api/import/route.ts` | Tour 3 with the samples in `e2e/fixtures`; `tests/import.test.ts` |
| Sharing | The owner shares with another user as viewer or editor, changes the role, or removes access | `lib/documents.ts`, `components/ShareDialog.tsx` | Tour 4; `tests/access.test.ts` |
| Owned vs shared | Separate "My documents" and "Shared with me" sections, role badges and the owner's name | `components/Dashboard.tsx`, `listDocuments()` in `lib/documents.ts` | Tour 5 |
| Persistence | SQLite: documents, formatting and shares survive reloads and server restarts | `lib/db.ts` | Tour 2; `tests/db.test.ts` |

## Stretch item built

**Viewer and editor roles.** One stretch item, carried through every layer rather than several done
partly:

- **Server:** `getRole()` in `lib/documents.ts` decides owner, editor, viewer or no access for
  every read and write. Viewers get 403 on edits; people without access get 404, so a guessed URL
  does not reveal that a document exists. The full table is in
  [`ARCHITECTURE.md`](ARCHITECTURE.md#access-control).
- **UI:** viewers get a view-only banner, a read-only title, no toolbar and no Share button; editors
  get everything except sharing and delete.
- **Checks:** every cell of the access table is covered in `tests/access.test.ts`. The browser run
  also calls the API directly as a viewer and as a user without access; tour 5 and 6 show the same
  by hand.

## Engineering quality

| Area | What to look at |
| --- | --- |
| Not losing work | Saves are sent one at a time; a save based on a stale version gets 409 and the user chooses "Load latest version" or "Overwrite with my version" (tour 7). Unsaved text is sent when leaving the editor. `components/DocEditor.tsx`, `updateDocument()` |
| Security | HMAC-signed session cookie (`lib/auth.ts`); allow-list HTML sanitizing for editor saves and imports (`lib/sanitize.ts`); server-side access checks on every route |
| Validation and errors | Input checks in `lib/documents.ts`; one wrapper turns known errors into JSON with the right status (`lib/http.ts`); messages are shown in the UI rather than failing silently |
| Code structure | Thin route handlers; all access rules in one module; see [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Tests | `npm test` (22 unit tests), `npm run typecheck`, and an optional 79-check browser run (`npm run test:e2e`) |

## Deliverables

| Deliverable | Where |
| --- | --- |
| Source code | This repository |
| Live product | URL at the top of [`README.md`](README.md) and in [`SUBMISSION.md`](SUBMISSION.md) |
| Walkthrough video | [`VIDEO_URL.txt`](VIDEO_URL.txt) |
| Setup and run instructions | [`README.md`](README.md#run-it-locally) |
| Test accounts | [`README.md`](README.md#demo-accounts) |
| Architecture note and tradeoffs | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| AI workflow note | [`AI_WORKFLOW.md`](AI_WORKFLOW.md) |
| What was left out, and what comes next | [`README.md`](README.md#scope-what-was-left-out-and-what-comes-next) |
