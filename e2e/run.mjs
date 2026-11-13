/**
 * End-to-end check of the main flows in a real browser (optional; `npm test` is the unit suite).
 *
 * Needs Google Chrome installed and the app running against a FRESH database:
 *   npm run build
 *   DATABASE_PATH=/tmp/ajaia-e2e.db npm start      # terminal 1 (delete the file before re-running)
 *   npm run test:e2e                                # terminal 2
 *
 * Env: BASE_URL (default http://localhost:3000), CHROME_PATH (path to a Chrome binary),
 *      SHOTS (directory to write screenshots into; omitted = no screenshots).
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const SHOTS = process.env.SHOTS;
const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const shot = (page, name) => (SHOTS ? page.screenshot({ path: path.join(SHOTS, name) }) : null);

let failures = 0;
let passes = 0;
function check(name, cond, detail = '') {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && detail ? '  -- ' + detail : ''}`);
}

const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
  args: process.getuid?.() === 0 ? ['--no-sandbox'] : [],
});

async function signInAs(name, contextOptions = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 820 }, ...contextOptions });
  const page = await ctx.newPage();
  // Any uncaught browser error (including React hydration errors) fails the run.
  page.on('pageerror', (e) => check(`no browser errors for ${name}`, false, e.message.slice(0, 200)));
  await page.goto(BASE + '/');
  await page.waitForURL('**/login');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await page.waitForURL(BASE + '/');
  return { ctx, page };
}
const saved = (page) => page.locator('.save-state', { hasText: 'All changes saved' }).waitFor({ timeout: 10000 });
const tool = (page, title) => page.getByRole('toolbar').getByRole('button', { name: new RegExp('^' + title) });
// Put the caret at the very end of the document. (Done through the DOM selection, which the
// editor follows, because synthetic End/arrow key presses do not move the caret in headless Chrome.)
const caretToEnd = async (page) => {
  await page.locator('.doc-content').click();
  await page.evaluate(() => {
    const selection = window.getSelection();
    selection.selectAllChildren(document.querySelector('.doc-content'));
    selection.collapseToEnd();
  });
  await page.waitForTimeout(50);
};
const typeAtEnd = async (page, text) => {
  await caretToEnd(page);
  await page.keyboard.type(text);
};
const apiCall = (page, url, method = 'GET', body) =>
  page.evaluate(async ([url, method, body]) => {
    const r = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, [url, method, body]);
const serverContent = async (page, id) => (await apiCall(page, `/api/documents/${id}`)).json.document.content;

try {
  // ---------- Alice: sign in, dashboard, create, rename, format, persist ----------
  const alice = await signInAs('Alice');
  const page = alice.page;
  const welcomeRow = page.locator('.doc-row', { hasText: 'Welcome to Ajaia Docs' });
  check('sign in as Alice lands on the dashboard with the seeded document', (await welcomeRow.count()) === 1);
  check('owned document shows Owner badge and share count',
    (await welcomeRow.innerText()).includes('Owner') && (await welcomeRow.innerText()).includes('Shared with 1'));

  await page.getByRole('button', { name: '+ New document' }).click();
  await page.waitForURL('**/doc/**');
  const docUrl = page.url();
  const docId = docUrl.split('/doc/')[1];
  await page.locator('.doc-content').waitFor();
  check('new document opens in the editor with a default title',
    (await page.getByLabel('Document title').inputValue()) === 'Untitled document');
  check('empty document shows a placeholder',
    (await page.locator('.doc-content p.is-editor-empty[data-placeholder="Start typing…"]').count()) === 1);
  check('empty document is focused and ready to type',
    await page.waitForFunction(() => document.activeElement?.classList.contains('doc-content'), null, { timeout: 2000 })
      .then(() => true, () => false));

  await page.getByLabel('Document title').fill('Q3 Launch Plan');
  await page.getByLabel('Document title').press('Enter');
  await saved(page);

  await page.locator('.doc-content').click();
  await page.getByLabel('Text style').selectOption('h1');
  await page.keyboard.type('Launch overview');
  await page.keyboard.press('Enter');
  await page.keyboard.type('This is ');
  await tool(page, 'Bold').click();
  check('toolbar shows Bold as active while typing bold', (await tool(page, 'Bold').getAttribute('aria-pressed')) === 'true');
  await page.keyboard.type('bold');
  await tool(page, 'Bold').click();
  await page.keyboard.type(', ');
  await tool(page, 'Italic').click();
  await page.keyboard.type('italic');
  await tool(page, 'Italic').click();
  await page.keyboard.type(' and ');
  await tool(page, 'Underline').click();
  await page.keyboard.type('underlined');
  await tool(page, 'Underline').click();
  await page.keyboard.type(' text.');
  await page.keyboard.press('Enter');
  await tool(page, 'Bulleted list').click();
  await page.keyboard.type('First bullet');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second bullet');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await tool(page, 'Numbered list').click();
  await page.keyboard.type('Step one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Step two');
  await saved(page);
  await shot(page, '02-editor.png');

  await page.reload();
  await page.locator('.doc-content').waitFor();
  const html = await page.locator('.doc-content').innerHTML();
  check('title persists after reload', (await page.getByLabel('Document title').inputValue()) === 'Q3 Launch Plan');
  check('heading persists', /<h1[^>]*>Launch overview<\/h1>/.test(html), html.slice(0, 120));
  check('bold persists', html.includes('<strong>bold</strong>'));
  check('italic persists', html.includes('<em>italic</em>'));
  check('underline persists', html.includes('<u>underlined</u>'));
  check('bulleted list persists', /<ul[^>]*>\s*<li[^>]*><p>First bullet<\/p><\/li>\s*<li[^>]*><p>Second bullet<\/p><\/li>\s*<\/ul>/.test(html));
  check('numbered list persists', /<ol[^>]*>\s*<li[^>]*><p>Step one<\/p><\/li>\s*<li[^>]*><p>Step two<\/p><\/li>\s*<\/ol>/.test(html));

  // Ctrl+S saves immediately (autosave alone would wait 800 ms)
  await typeAtEnd(page, ' Saved with the keyboard.');
  const [ctrlS] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/api/documents/'), { timeout: 600 })
      .catch(() => null),
    page.keyboard.press('Control+s'),
  ]);
  check('Ctrl+S saves immediately', ctrlS?.ok() === true);
  await saved(page);

  // Saves are serialized: typing while a slow save is in flight must not conflict with itself
  await page.route('**/api/documents/*', async (route) => {
    if (route.request().method() === 'PATCH') await new Promise((r) => setTimeout(r, 700));
    await route.continue();
  });
  await typeAtEnd(page, ' SLOW1');
  await page.waitForTimeout(1000); // first save is now in flight
  await page.keyboard.type(' SLOW2');
  await page.waitForTimeout(300);
  await page.keyboard.type(' SLOW3');
  await saved(page);
  await page.unroute('**/api/documents/*');
  check('typing during a slow save does not raise a conflict or error', (await page.locator('.error-banner').count()) === 0);
  check('everything typed during a slow save is stored', (await serverContent(page, docId)).includes('SLOW1 SLOW2 SLOW3'));

  // Leave right after typing, before the autosave delay
  await caretToEnd(page);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('LASTWORDS');
  const leaveSave = page.waitForResponse((r) => r.request().method() === 'PATCH', { timeout: 5000 }).catch(() => null);
  await page.getByRole('link', { name: 'Back to documents' }).click();
  await page.waitForURL(BASE + '/');
  check('leaving the editor saves unsaved typing immediately', (await leaveSave)?.ok() === true);
  check('typing right before leaving is stored (and Ctrl+B works)',
    (await serverContent(page, docId)).includes('<strong>LASTWORDS</strong>'));

  // Browser Back restores the editor from the router cache; it must show the latest content
  await page.goBack();
  await page.waitForURL(docUrl);
  check('browser Back shows the latest content, not a cached copy',
    await page.locator('.doc-content', { hasText: 'LASTWORDS' }).waitFor({ timeout: 5000 }).then(() => true, () => false));
  await typeAtEnd(page, ' AFTERBACK');
  await saved(page).catch(() => {});
  check('editing after browser Back saves without a false conflict',
    (await page.locator('.error-banner').count()) === 0 && (await serverContent(page, docId)).includes('AFTERBACK'));

  // Rename, then browser Back to the dashboard: the list must show the new title
  await page.getByLabel('Document title').fill('Q3 Launch Plan (draft)');
  await page.getByLabel('Document title').press('Enter');
  await page.waitForResponse((r) => r.request().method() === 'PATCH', { timeout: 5000 }).catch(() => null);
  await page.goBack();
  await page.waitForURL(BASE + '/');
  check('dashboard after browser Back shows the new title',
    await page.locator('.doc-row', { hasText: 'Q3 Launch Plan (draft)' }).waitFor({ timeout: 5000 }).then(() => true, () => false));
  await page.goto(docUrl);
  await page.locator('.doc-content').waitFor();
  await page.getByLabel('Document title').fill('Q3 Launch Plan');
  await page.getByLabel('Document title').press('Enter');
  await saved(page);

  // Reload immediately after typing (within the autosave delay)
  let unloadPrompts = 0;
  const acceptPrompt = (d) => { unloadPrompts++; d.accept(); };
  page.on('dialog', acceptPrompt);
  await typeAtEnd(page, ' QUICKRELOAD');
  await page.reload();
  await page.locator('.doc-content').waitFor();
  page.off('dialog', acceptPrompt);
  check('reloading right after typing keeps the text', (await page.locator('.doc-content').innerText()).includes('QUICKRELOAD'),
    `prompts shown: ${unloadPrompts}`);
  await typeAtEnd(page, ' AFTERRELOAD');
  await saved(page).catch(() => {});
  check('editing after a quick reload saves without a false conflict',
    (await page.locator('.error-banner').count()) === 0 && (await serverContent(page, docId)).includes('AFTERRELOAD'));
  await page.reload(); // nothing unsaved now: must not prompt
  await page.locator('.doc-content').waitFor();
  check('opening a document does not trigger a save by itself', (await serverContent(page, docId)).includes('AFTERRELOAD') &&
    (await page.locator('.save-state').innerText()) === 'All changes saved');

  // Validation
  await page.getByLabel('Document title').fill('   ');
  await page.getByLabel('Document title').press('Enter');
  check('empty title restores the previous title', (await page.getByLabel('Document title').inputValue()) === 'Q3 Launch Plan');
  check('API rejects an empty title (400)', (await apiCall(page, `/api/documents/${docId}`, 'PATCH', { title: '' })).status === 400);
  check('API rejects a non-object body (400)', (await apiCall(page, `/api/documents/${docId}`, 'PATCH', [1])).status === 400);
  check('API rejects unshare without a user (400)', (await apiCall(page, `/api/documents/${docId}/shares`, 'DELETE')).status === 400);

  // ---------- Alice shares with Bob as viewer ----------
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Only you can see this document.').waitFor();
  await dialog.getByLabel('Person').selectOption('bob@ajaia.test');
  await dialog.getByLabel('Permission', { exact: true }).selectOption('viewer');
  await dialog.getByRole('button', { name: 'Share', exact: true }).click();
  await dialog.locator('.share-list li', { hasText: 'Bob Martinez' }).waitFor();
  check('share dialog lists Bob after sharing', true);
  check('a person who already has access is removed from the picker',
    !(await dialog.getByLabel('Person').innerText()).includes('Bob'));
  await shot(page, '03-share-dialog.png');
  await page.keyboard.press('Escape');
  check('Escape closes the share dialog', (await page.getByRole('dialog').count()) === 0);

  // ---------- Bob: sees it as shared, view only ----------
  const bob = await signInAs('Bob');
  const bp = bob.page;
  const sharedSection = bp.locator('section', { hasText: 'Shared with me' });
  const ownedSection = bp.locator('section', { hasText: 'My documents' });
  const q3Row = sharedSection.locator('.doc-row', { hasText: 'Q3 Launch Plan' });
  check('Bob sees the document under "Shared with me"', (await q3Row.count()) === 1);
  check('shared row shows the owner and a View only badge',
    (await q3Row.innerText()).includes('Owned by Alice Chen') && (await q3Row.innerText()).includes('View only'));
  check('Bob\'s "My documents" does not contain it', (await ownedSection.locator('.doc-row', { hasText: 'Q3 Launch Plan' }).count()) === 0);
  check('seeded document shows "Can edit" for Bob',
    (await sharedSection.locator('.doc-row', { hasText: 'Welcome' }).innerText()).includes('Can edit'));
  await bp.waitForTimeout(200);
  await shot(bp, '04-shared-with-me.png');

  await q3Row.getByRole('link').click();
  await bp.waitForURL('**/doc/**');
  await bp.locator('.doc-content').waitFor();
  check('viewer: no toolbar', (await bp.locator('.toolbar').count()) === 0);
  check('viewer: view-only banner', (await bp.getByText('You have view-only access').count()) === 1);
  check('viewer: content is not editable', (await bp.locator('.doc-content').getAttribute('contenteditable')) === 'false');
  check('viewer: title is read-only', (await bp.getByLabel('Document title').getAttribute('readonly')) !== null);
  check('viewer: no Share button', (await bp.getByRole('button', { name: 'Share', exact: true }).count()) === 0);
  check('viewer: sees who shared it', (await bp.getByText('Shared by Alice Chen · View only').count()) === 1);
  await shot(bp, '05-view-only.png');
  check('viewer: API edit blocked (403)', (await apiCall(bp, `/api/documents/${docId}`, 'PATCH', { content: '<p>x</p>' })).status === 403);
  check('viewer: API delete blocked (403)', (await apiCall(bp, `/api/documents/${docId}`, 'DELETE')).status === 403);
  check('viewer: API cannot list shares (403)', (await apiCall(bp, `/api/documents/${docId}/shares`)).status === 403);
  check('viewer: API cannot re-share (403)', (await apiCall(bp, `/api/documents/${docId}/shares`, 'POST', { email: 'carol@ajaia.test' })).status === 403);

  // Bob edits the document he has editor access to
  await bp.goto(BASE + '/doc/welcome');
  await bp.locator('.doc-content').waitFor();
  check('editor: toolbar visible', (await bp.locator('.toolbar').count()) === 1);
  check('editor: no Share button (owner only)', (await bp.getByRole('button', { name: 'Share', exact: true }).count()) === 0);
  await caretToEnd(bp);
  await bp.keyboard.press('Enter');
  await bp.keyboard.type('Bob edited this.');
  await saved(bp);

  // ---------- Carol: no access ----------
  const carol = await signInAs('Carol');
  const cp = carol.page;
  check('Carol sees no documents', (await cp.locator('.doc-row').count()) === 0 && (await cp.locator('.empty').count()) === 2);
  const resp = await cp.goto(docUrl);
  check('Carol: direct URL returns the 404 page', resp.status() === 404 && (await cp.getByText('Document not found').count()) === 1, `status ${resp.status()}`);
  await cp.goto(BASE + '/');
  check('Carol: API read blocked (404)', (await apiCall(cp, `/api/documents/${docId}`)).status === 404);
  check('Carol: API edit blocked (404)', (await apiCall(cp, `/api/documents/${docId}`, 'PATCH', { title: 'x' })).status === 404);

  // ---------- Anonymous / forged session ----------
  const anon = await browser.newContext();
  check('anonymous API call returns 401', (await anon.request.get(BASE + '/api/documents')).status() === 401);
  await anon.addCookies([{ name: 'ajaia_session', value: 'u_alice.deadbeef', url: BASE }]);
  check('forged session cookie returns 401', (await anon.request.get(BASE + '/api/documents')).status() === 401);
  await anon.addCookies([{ name: 'ajaia_session', value: 'u_alice', url: BASE }]);
  check('unsigned session cookie returns 401', (await anon.request.get(BASE + '/api/documents')).status() === 401);
  const anonPage = await anon.newPage();
  await anonPage.goto(docUrl);
  check('anonymous document URL redirects to sign-in', anonPage.url().endsWith('/login'));

  // ---------- Two people editing the same document: conflict detection ----------
  await page.goto(BASE + '/doc/welcome');
  await page.locator('.doc-content').waitFor();
  check('owner sees the editor\'s change', (await page.locator('.doc-content').innerText()).includes('Bob edited this.'));

  await typeAtEnd(bp, ' BOB-EDIT');
  await saved(bp); // Bob saves first; Alice's open copy is now stale
  await typeAtEnd(page, ' ALICE-EDIT');
  await page.locator('.error-banner', { hasText: 'changed somewhere else' }).waitFor({ timeout: 5000 });
  check('a stale editor gets a conflict warning', true);
  let stored = await serverContent(page, 'welcome');
  check('the other person\'s work is not overwritten', stored.includes('BOB-EDIT') && !stored.includes('ALICE-EDIT'));
  await shot(page, '08-conflict.png');
  await Promise.all([page.waitForNavigation(), page.getByRole('button', { name: 'Load latest version' }).click()]);
  await page.locator('.doc-content', { hasText: 'BOB-EDIT' }).waitFor({ timeout: 5000 });
  check('"Load latest version" shows the other person\'s work',
    !(await page.locator('.doc-content').innerText()).includes('ALICE-EDIT'));

  await typeAtEnd(page, ' ALICE-2');
  await saved(page); // now Bob's copy is the stale one
  await typeAtEnd(bp, ' BOB-2');
  await bp.locator('.error-banner', { hasText: 'changed somewhere else' }).waitFor({ timeout: 5000 });
  await bp.getByRole('button', { name: 'Overwrite with my version' }).click();
  await saved(bp);
  stored = await serverContent(bp, 'welcome');
  check('"Overwrite with my version" saves the chosen version', stored.includes('BOB-2') && !stored.includes('ALICE-2'));
  check('conflict banner clears after resolving', (await bp.locator('.error-banner').count()) === 0);
  await typeAtEnd(bp, ' BOB-3');
  await saved(bp);
  check('saving continues normally after a resolved conflict', (await serverContent(bp, 'welcome')).includes('BOB-3'));

  // ---------- Alice upgrades Bob, then revokes ----------
  await page.goto(docUrl);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const d2 = page.getByRole('dialog');
  await d2.getByLabel('Permission for Bob Martinez').selectOption('editor');
  await d2.locator('.share-list select:not([disabled])').waitFor();
  check('after upgrade to editor, Bob can edit via API (200)', (await apiCall(bp, `/api/documents/${docId}`, 'PATCH', { title: 'Q3 Launch Plan' })).status === 200);
  await d2.getByRole('button', { name: 'Remove' }).click();
  await d2.getByText('Only you can see this document.').waitFor();
  check('after access is removed, Bob loses access (404)', (await apiCall(bp, `/api/documents/${docId}`)).status === 404);
  await page.keyboard.press('Escape');

  // ---------- Import ----------
  async function importFile(file) {
    await page.goto(BASE + '/');
    await page.locator('input[type=file]').setInputFiles(file);
  }
  await importFile(path.join(FIX, 'sample.md'));
  await page.waitForURL('**/doc/**');
  await page.locator('.doc-content').waitFor();
  let ih = await page.locator('.doc-content').innerHTML();
  check('.md import: title from file name', (await page.getByLabel('Document title').inputValue()) === 'sample');
  check('.md import: headings, bold, italic, lists',
    /<h1[^>]*>Sprint Review<\/h1>/.test(ih) && ih.includes('<strong>weekly</strong>') && ih.includes('<em>design</em>') &&
    /<h2[^>]*>Decisions<\/h2>/.test(ih) && /<ul/.test(ih) && /<ol/.test(ih), ih.slice(0, 200));
  await shot(page, '06-imported-markdown.png');

  // Clicking into a document (this one ends with a list) must not change or save it
  const watchPatches = (p) => {
    const seen = [];
    const onResponse = (r) => { if (r.request().method() === 'PATCH') seen.push(r.status()); };
    p.on('response', onResponse);
    return { seen, stop: () => p.off('response', onResponse) };
  };
  const sampleId = page.url().split('/doc/')[1];
  const ownerWatch = watchPatches(page);
  await page.locator('.doc-content li').first().click();
  await page.waitForTimeout(1300);
  ownerWatch.stop();
  check('clicking into a document without typing does not save it', ownerWatch.seen.length === 0, `PATCH: ${ownerWatch.seen}`);
  await apiCall(page, `/api/documents/${sampleId}/shares`, 'POST', { email: 'bob@ajaia.test', role: 'viewer' });
  const viewerWatch = watchPatches(bp);
  await bp.goto(`${BASE}/doc/${sampleId}`);
  await bp.locator('.doc-content').waitFor();
  await bp.locator('.doc-content li').first().click();
  await bp.locator('.doc-content li').first().dblclick();
  await bp.waitForTimeout(1300);
  viewerWatch.stop();
  check('a viewer clicking around sends no save and sees no error',
    viewerWatch.seen.length === 0 && (await bp.locator('.error-banner').count()) === 0, `PATCH: ${viewerWatch.seen}`);

  await importFile(path.join(FIX, 'Quarterly Report.docx'));
  await page.waitForURL('**/doc/**');
  await page.locator('.doc-content').waitFor();
  ih = await page.locator('.doc-content').innerHTML();
  check('.docx import: title from file name', (await page.getByLabel('Document title').inputValue()) === 'Quarterly Report');
  check('.docx import: heading, bold, italic, lists',
    /<h1[^>]*>Quarterly Report<\/h1>/.test(ih) && ih.includes('<strong>strongly</strong>') && ih.includes('<em>slightly</em>') &&
    /<ul/.test(ih) && /<ol/.test(ih), ih.slice(0, 300));
  await typeAtEnd(page, ' Edited after import.');
  await saved(page);
  await page.reload();
  await page.locator('.doc-content').waitFor();
  check('.docx import: result is editable and persists', (await page.locator('.doc-content').innerText()).includes('Edited after import.'));

  await importFile(path.join(FIX, 'meeting-notes.txt'));
  await page.waitForURL('**/doc/**');
  await page.locator('.doc-content').waitFor();
  const txt = await page.locator('.doc-content').innerText();
  check('.txt import: text preserved, angle brackets shown literally',
    txt.includes('Plain text import') && txt.includes('Second paragraph with <tags> & symbols.'), JSON.stringify(txt));
  check('.txt import: blank lines become paragraphs', (await page.locator('.doc-content > p').count()) === 2);

  await importFile(path.join(FIX, 'photo.png'));
  await page.locator('.error-banner', { hasText: 'Unsupported file type' }).waitFor({ timeout: 5000 });
  check('unsupported file type shows a clear error naming the supported types',
    (await page.locator('.error-banner').innerText()).includes('.txt, .md, .docx'));
  check('still on the dashboard after a failed import', page.url() === BASE + '/');
  await shot(page, '07-import-error.png');

  const big = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ajaia-e2e-')), 'big.txt');
  fs.writeFileSync(big, 'a'.repeat(3_000_000));
  await importFile(big);
  await page.locator('.error-banner', { hasText: 'too large' }).waitFor({ timeout: 8000 });
  check('oversized file shows a clear error', true);

  // ---------- Dashboard + delete ----------
  await page.goto(BASE + '/');
  await page.waitForTimeout(200);
  await shot(page, '01-dashboard.png');
  const before = await page.locator('section', { hasText: 'My documents' }).locator('.doc-row').count();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete meeting-notes' }).click();
  await page.locator('.doc-row', { hasText: 'meeting-notes' }).waitFor({ state: 'detached', timeout: 5000 });
  const after = await page.locator('section', { hasText: 'My documents' }).locator('.doc-row').count();
  check('owner can delete a document', after === before - 1, `${before} -> ${after}`);

  // ---------- Switch user ----------
  await page.getByRole('button', { name: 'Switch user' }).click();
  await page.waitForURL('**/login');
  await shot(page, '00-login.png');
  await page.goto(BASE + '/');
  check('after switching user, the dashboard requires sign-in again', page.url().endsWith('/login'));

  // ---------- Viewer in another time zone (server-rendered dates must hydrate cleanly) ----------
  const abroad = await signInAs('Alice', { timezoneId: 'America/New_York', locale: 'en-GB' });
  await abroad.page.reload();
  const time = abroad.page.locator('.doc-row time').first();
  await abroad.page.waitForFunction(
    () => !/^\d{4}-\d{2}-\d{2}$/.test(document.querySelector('.doc-row time')?.textContent ?? ''), null, { timeout: 3000 }
  ).catch(() => {});
  check('dates are shown in the viewer\'s own locale and time zone', /^\d{1,2} \w{3} \d{4}, \d{2}:\d{2}$/.test(await time.innerText()), await time.innerText());
} catch (e) {
  check('script completed', false, e.message.split('\n').slice(0, 6).join(' | '));
} finally {
  await browser.close();
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
