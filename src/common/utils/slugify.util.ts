export function slugify(text: string): string {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics / accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // remove invalid chars
    .replace(/[\s_-]+/g, '-') // collapse whitespace and underscores to a single dash
    .replace(/^-+|-+$/g, ''); // trim leading and trailing dashes
}
