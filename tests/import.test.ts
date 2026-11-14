import { describe, expect, it } from 'vitest';
import { createDb } from '../lib/db';
import { createDocument } from '../lib/documents';
import { convertUpload, MAX_UPLOAD_BYTES } from '../lib/importFile';

const statusOf = async (p: Promise<unknown>) => p.then(() => 'no error', (e) => e.status);

describe('file import', () => {
  it('turns a .txt file into paragraphs and escapes HTML', async () => {
    const out = await convertUpload('notes.txt', Buffer.from('First line\nsecond line\n\n<b>Second</b> para'));
    expect(out.title).toBe('notes');
    expect(out.content).toBe('<p>First line<br />second line</p><p>&lt;b&gt;Second&lt;/b&gt; para</p>');
  });

  it('converts Markdown structure to rich text', async () => {
    const out = await convertUpload('Meeting Notes.md', Buffer.from('# Title\n\nSome **bold** text\n\n- a\n- b\n'));
    expect(out.title).toBe('Meeting Notes');
    expect(out.content).toContain('<h1>Title</h1>');
    expect(out.content).toContain('<strong>bold</strong>');
    expect(out.content).toMatch(/<ul>\s*<li>a<\/li>\s*<li>b<\/li>\s*<\/ul>/);
  });

  it('reads files saved with a byte-order mark, in UTF-16 or with Windows line endings', async () => {
    const md = await convertUpload('notes.md', Buffer.from('\uFEFF# Title\r\n\r\nBody\r\n'));
    expect(md.content).toContain('<h1>Title</h1>');
    expect(md.content).not.toContain('\uFEFF');

    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Héllo\r\nthere\r\n\r\nWörld', 'utf16le')]);
    expect((await convertUpload('notes.txt', utf16)).content).toBe('<p>Héllo<br />there</p><p>Wörld</p>');
  });

  it('turns a text file just under the 2 MB limit into a document', async () => {
    const paragraph = 'The quick brown fox jumps over the lazy dog. '.repeat(20) + '\n\n';
    const text = paragraph.repeat(Math.floor((MAX_UPLOAD_BYTES - 10_000) / paragraph.length));
    const doc = createDocument(createDb(':memory:'), 'u_alice', await convertUpload('long.txt', Buffer.from(text)));
    expect(doc.content.length).toBeGreaterThan(2_000_000);
  });

  it('sanitizes HTML embedded in Markdown', async () => {
    const out = await convertUpload('x.md', Buffer.from('hello <script>alert(1)</script>'));
    expect(out.content).not.toContain('script');
  });

  it('rejects unsupported, empty, oversized and corrupt files', async () => {
    expect(await statusOf(convertUpload('photo.png', Buffer.from('x')))).toBe(415);
    expect(await statusOf(convertUpload('noextension', Buffer.from('x')))).toBe(415);
    expect(await statusOf(convertUpload('empty.txt', Buffer.alloc(0)))).toBe(400);
    expect(await statusOf(convertUpload('big.txt', Buffer.alloc(MAX_UPLOAD_BYTES + 1, 'a')))).toBe(413);
    expect(await statusOf(convertUpload('broken.docx', Buffer.from('not a zip')))).toBe(400);
  });
});
