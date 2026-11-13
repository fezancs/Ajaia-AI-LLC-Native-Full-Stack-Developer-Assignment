import sanitizeHtml from 'sanitize-html';

/**
 * Document content is stored as HTML. Everything that reaches the database
 * (editor saves and file imports) passes through this allow-list, so stored
 * content only ever contains the formatting the editor itself supports.
 */
export function sanitizeContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p', 'br', 'hr', 'h1', 'h2', 'h3',
      'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre', 'blockquote',
      'ul', 'ol', 'li', 'a',
    ],
    allowedAttributes: { a: ['href', 'target', 'rel'], ol: ['start'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    // Headings deeper than the editor supports are kept as h3 rather than dropped.
    transformTags: { h4: 'h3', h5: 'h3', h6: 'h3' },
  });
}
