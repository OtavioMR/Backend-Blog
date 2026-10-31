import { describe, expect, it } from 'vitest';
import { escapeHtml } from './escape-html.js';

describe('escapeHtml', () => {
  it('escapes HTML special characters, including existing entities', () => {
    expect(escapeHtml(`<a href="x">Tom &amp; 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp;amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
  });

  it('preserves ordinary text', () => {
    expect(escapeHtml('Olá Maria')).toBe('Olá Maria');
  });
});
