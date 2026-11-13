import { describe, expect, it } from 'vitest';
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
