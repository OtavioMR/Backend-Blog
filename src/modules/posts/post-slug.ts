export function postSlug(title: string, id: string): string {
  const base = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100).replace(/-+$/g, '');
  return `${base || 'artigo'}-${id}`;
}
