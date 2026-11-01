export function postSlug(title: string, id: string): string {
  const base = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100).replace(/-+$/g, '');
  return `${base || 'artigo'}-${id}`;
}

// Keep postSlug unchanged because the original migration imports it.
export function shortPostSlug(title: string): string {
  const base = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100).replace(/-+$/g, '');
  const value = base || 'artigo';
  return /^(me|saved)$/.test(value) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
    ? `artigo-${value}` : value;
}
