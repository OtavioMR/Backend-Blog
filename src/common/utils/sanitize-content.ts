import sanitizeHtml from 'sanitize-html';

export function sanitizePostContent(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'h2', 'h3', 'h4', 'a'],
    allowedAttributes: { a: ['href', 'title'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
  });
}

export function sanitizePlainText(value: string): string {
  const escaped = sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} });
  const characters: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
  return escaped.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => characters[entity]).trim();
}
