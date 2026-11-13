# Submission contents

**Project:** Ajaia Docs, a lightweight collaborative document editor
**Assignment:** Ajaia LLC, AI-Native Full Stack Developer

## Links

| Item | Where |
| --- | --- |
| Live product URL | TODO: paste the deployed URL |
| Walkthrough video | TODO: paste the link (also in `VIDEO_URL.txt`) |
| Source code | this folder (and the GitHub repository, if shared) |

## Test accounts

No passwords. Choose an account on the sign-in page.

| Account | Email | Use it to |
| --- | --- | --- |
| Alice Chen | alice@ajaia.test | Own documents and share them |
| Bob Martinez | bob@ajaia.test | See documents shared with him (starts as editor of Alice's welcome document) |
| Carol Singh | carol@ajaia.test | Confirm that unshared documents are not visible |

Use a second browser or a private window to be two users at once.

## What is included

| File or folder | What it is |
| --- | --- |
| `README.md` | Setup and run instructions, reviewer tour, supported file types, deployment |
| `ARCHITECTURE.md` | Architecture note: priorities, design decisions, tradeoffs |
| `AI_WORKFLOW.md` | AI workflow note: tools, where AI helped, what was changed or rejected, verification |
| `SUBMISSION.md` | This file |
| `VIDEO_URL.txt` | Link to the walkthrough video |
| `app/`, `components/`, `lib/` | Application source (Next.js, TypeScript) |
| `tests/` | Automated unit tests (`npm test`) |
| `e2e/` | Optional browser test script and sample files for import |
| `docs/screenshots/` | Screenshots of each screen |
| `render.yaml`, `.env.example`, `.node-version`, `.npmrc` | Deployment and configuration |
| `package.json`, `package-lock.json`, config files | Dependencies and tooling |

## Status

**Working end to end**

- Create, rename, edit, autosave, reopen and delete documents
- Rich text: bold, italic, underline, headings, bulleted and numbered lists, undo and redo
- Import `.txt`, `.md` and `.docx` files (up to 2 MB) as new editable documents
- Share a document with another user as viewer or editor, change the role, remove access
- Owned and shared documents shown separately, with role badges and the owner's name
- Persistence in SQLite, including formatting and shares
- Validation, error messages, server-side access checks, conflict detection between two editors
- 20 automated unit tests, plus an optional 79-check browser run

**Not built (by design)**

- Live co-editing: edits by other people appear after a reload, and conflicting saves are detected
  rather than merged
- Real authentication: sign-in is a demo account picker
- Comments, suggestions, version history, export, images and tables

**Next, with another 2 to 4 hours**

1. Presence and live refresh between collaborators
2. Version history with restore
3. Real accounts and invitations by email
4. Export to Markdown and PDF
