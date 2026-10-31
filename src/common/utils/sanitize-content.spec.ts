import { sanitizePostContent, sanitizePlainText } from './sanitize-content.js';

it('removes executable HTML while retaining safe formatting', () => {
  expect(sanitizePostContent('<p onclick="alert(1)">OK<script>alert(1)</script><a href="javascript:alert(1)">link</a></p>')).toBe('<p>OK<a>link</a></p>');
  expect(sanitizePlainText('<img src=x onerror=alert(1)>hello')).toBe('hello');
});
