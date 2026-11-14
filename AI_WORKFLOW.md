# AI workflow note

## Tools

- **Claude (Anthropic)** running as a coding agent with a sandbox: it could edit files, run shell
  commands, run the test suite and drive a real Chrome browser against the running app.

## How the work was split

I gave Claude the assignment brief. Before writing code it asked three scoping questions, and I
made those calls:

| Decision | My choice |
| --- | --- |
| Scope | Build the full app, tests and written deliverables |
| Stack | Next.js + SQLite + Tiptap (one repo, one deploy) |
| Deployment | Code on GitHub, deployed to a host with a persistent disk; I record the walkthrough myself |

Claude then proposed the product slice (file import creates a new document, viewer and editor roles
as the one stretch item, demo sign-in with seeded accounts), implemented it, and verified it.

## Where AI materially sped things up

- **First working version.** Schema, access rules, API routes, the editor, dashboard and share
  dialog were written in one pass and compiled and passed tests on the first run.
- **Tests.** The unit tests for the access matrix and the browser script that walks every user flow
  would have taken a large share of the timebox by hand.
- **Finding bugs that only appear in a browser.** Claude ran the production build in Chrome,
  looked at screenshots, and probed edge cases (Back button, reload mid-typing, two editors,
  another time zone). Most of the fixes below came from that, not from reading code.
- **Checking deployment facts** against the hosts' current documentation instead of assuming.

## AI output that was changed or rejected

Each of these was in the first AI-written version and was caught by running the app, then fixed.

| First version | Problem found | What it became |
| --- | --- | --- |
| Dashboard dates formatted during server rendering | React hydration error when the server and the browser are in different time zones (reproduced with a browser set to another zone) | Dates render as a neutral value on the server and switch to local format in the browser |
| Editor trusted the data it was rendered with | Browser Back restored a cached page: an edited document appeared empty with its old title, and the next keystroke raised a false conflict | Editor re-checks the server when it opens; dashboard refreshes on return |
| "Save on page hide" for unsaved text | Reloading within the autosave delay showed the page without the last words | Save starts before the page unloads, with the browser's leave-site confirmation |
| Overlapping autosave requests | Would have conflicted with themselves once version checks were added | Saves are sent one at a time; text typed meanwhile is saved right after |
| Tiptap's default "trailing node" | Simply clicking into a document that ends with a list counted as an edit and saved; a viewer doing so got a permission error | Extension disabled; viewers never send saves |
| Silent last-write-wins between two editors | One person could erase the other's work without anyone noticing | Version check with a clear choice: load theirs or overwrite |
| "Remove access" sent its data in a DELETE body | Not reliably forwarded by proxies | Query parameter |
| Dependencies installed fine the first time | A clean install from the lockfile tried to recompile the SQLite driver from source and failed; reviewers without a C++ toolchain would have hit the same wall | `.npmrc` disables install scripts so the driver's bundled binaries are used; Node 22+ is stated as the requirement |
| Initial plan: a Render blueprint as the deploy path | Render's documentation: persistent disks need a paid instance, and the free tier's filesystem resets whenever the service sleeps | Railway with a volume is the recommended path; Render is documented as a paid alternative with the free-tier caveat |

Rejected or deferred on purpose: real-time co-editing, comments, version history and export (scope);
a Dockerfile (it could not be tested in the build environment, so it was not shipped).

One false alarm is worth noting: a browser test appeared to show text landing in the wrong place.
It was the test harness (synthetic Ctrl+End does not move the caret in headless Chrome), not the
app, so the harness was fixed and the app left alone.

## How correctness, UX and reliability were verified

The automated checks below were written and run by Claude during the build. They are in the
repository and can be re-run with the commands in the README. What I checked by hand is under
"My own review".

- **Unit tests (22):** every cell of the access matrix, sharing rules, validation, HTML sanitizing
  (including script and `javascript:` injection), conflict detection, file import (all three types
  plus unsupported, empty, oversized and corrupt files) and persistence across restarts.
- **Browser run (79 checks)** against the production build with three signed-in users at once:
  formatting survives a reload, autosave and Ctrl+S, leaving mid-typing, Back button, sharing as
  viewer and editor, role change and removal, direct-URL and API access attempts by users without
  access, forged session cookies, two-editor conflicts, all import paths, delete, and a viewer in
  another time zone.
- **Screenshots** of every screen were reviewed, including a phone-width layout.
- **Clean install:** `npm ci`, type check, tests and production build from a fresh copy of the
  source, then the full browser run again against that build and against the dev server.

## Final review before submission

Before submitting, I had Claude review the repository once more from a clean clone: install, type
check, unit tests, production build, the full browser run, and a sweep of every screen for console
errors in production and dev mode, at desktop and phone width. All of that passed. Reading the code
and probing edge cases turned up the following, which were fixed:

- **`EVALUATION.md` was missing.** README and SUBMISSION linked to it, but it had never been
  committed. It is now added.
- **Text files saved on Windows.** A Markdown file saved with a byte-order mark lost its first
  heading, and a UTF-16 text file (Notepad's "Unicode", PowerShell's `>`) imported as garbled text.
  The importer now detects the encoding.
- **Imports between about 1 and 2 MB.** They passed the 2 MB upload limit, then failed as
  "Document is too large" because of a separate 1-million-character cap on document content. The
  cap is now 5 million characters; a 2 MB document still opens in under a second and autosaves
  normally.
- **Access tests.** The unit tests now also cover viewers and people without access attempting
  owner-only actions, so every cell of the access table in `ARCHITECTURE.md` is tested.

Two unit tests were added (one for encodings, one for a file just under 2 MB); both failed before
the fixes and pass after them.

## My own review

What I did myself, separately from the AI's work:

- **Made the scoping calls** before any code was written: the scope, the stack and the deployment
  route (see the table above).
- **Published and deployed it.** I created the GitHub repository and pushed the code. On Railway I
  signed in, and Claude carried out the setup in my browser at my direction: a persistent volume,
  the port and the public domain. It then created a test document, restarted the container and
  confirmed the document was still there.
- **Used the product by hand on the live deployment** as two users while recording the
  walkthrough video: creating, renaming and formatting a document, importing files, sharing with
  view and edit permissions, autosave, and the conflict warning when two people edit at once.
