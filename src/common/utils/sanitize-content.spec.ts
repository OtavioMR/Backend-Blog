import { sanitizePostContent, sanitizePlainText } from './sanitize-content.js';

it('removes executable HTML while retaining safe formatting', () => {
  expect(sanitizePostContent('<p onclick="alert(1)">OK<script>alert(1)</script><a href="javascript:alert(1)">link</a></p>')).toBe('<p>OK<a>link</a></p>');
  expect(sanitizePlainText('<img src=x onerror=alert(1)>hello')).toBe('hello');
});

it('preserves plain text within storage limits without expanding HTML entities', () => {
  const content = 'a'.repeat(999) + '&';
  expect(sanitizePlainText(content)).toBe(content);
  expect(sanitizePlainText('a < b & c')).toBe('a < b & c');
  expect(sanitizePlainText('<script>alert(1)</script>safe')).toBe('safe');
});
