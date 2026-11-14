import mammoth from 'mammoth';
import { marked } from 'marked';
import { AppError } from './errors';
import { sanitizeContent } from './sanitize';

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.docx'] as const;
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Decode a .txt or .md upload. A byte-order mark is honored and dropped: Windows tools often
 * save UTF-8 with one (left in place, it hides a leading "# Heading" from the Markdown parser)
 * or save UTF-16 ("Unicode" in Notepad, PowerShell's `>`), which comes out garbled if read as
 * UTF-8. Line endings are normalized to \n.
 */
function decodeText(data: Buffer): string {
  const utf16 = data.length >= 2 && data[0] === 0xff && data[1] === 0xfe;
  return new TextDecoder(utf16 ? 'utf-16le' : 'utf-8').decode(data).replace(/\r\n?/g, '\n');
}

function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Convert an uploaded file into a document title and sanitized HTML content. */
export async function convertUpload(
  fileName: string,
  data: Buffer
): Promise<{ title: string; content: string }> {
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new AppError(415, `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}.`);
  }
  if (data.length === 0) throw new AppError(400, 'The file is empty.');
  if (data.length > MAX_UPLOAD_BYTES) throw new AppError(413, 'File is too large (max 2 MB).');

  let html: string;
  if (ext === '.txt') {
    html = textToHtml(decodeText(data));
  } else if (ext === '.md') {
    html = marked.parse(decodeText(data), { async: false }) as string;
  } else {
    try {
      html = (await mammoth.convertToHtml({ buffer: data })).value;
    } catch {
      throw new AppError(400, 'Could not read this .docx file. It may be corrupted.');
    }
  }

  const title = (dot > 0 ? fileName.slice(0, dot) : fileName).trim().slice(0, 200) || 'Imported document';
  return { title, content: sanitizeContent(html) };
}
