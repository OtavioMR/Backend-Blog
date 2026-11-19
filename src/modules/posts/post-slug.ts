export function postSlug(title: string, id: string): string {
  const base = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100).replace(/-+$/g, '');
  return `${base || 'artigo'}-${id}`;
}

// Both historical migrations rely on the original slug defaults.
export function shortPostSlug(title: string, fallback = 'artigo'): string {
  const base = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100).replace(/-+$/g, '');
  const value = base || fallback;
  return /^(me|saved)$/.test(value) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
    ? `${fallback}-${value}` : value;
}
