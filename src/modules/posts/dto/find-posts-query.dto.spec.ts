import { validate } from 'class-validator';
import { FindPostsQueryDto } from './find-posts-query.dto.js';

it('rejects oversized text filters', async () => {
  for (const key of ['search', 'author', 'categoryName', 'categorySlug', 'tagSlug']) {
    const dto = Object.assign(new FindPostsQueryDto(), { [key]: 'x'.repeat(101) });
    expect((await validate(dto)).some(error => error.property === key)).toBe(true);
  }
});

it('validates authorId format', async () => {
  const invalid = Object.assign(new FindPostsQueryDto(), { authorId: 'not-a-uuid' });
  expect((await validate(invalid)).some(error => error.property === 'authorId')).toBe(true);

  const valid = Object.assign(new FindPostsQueryDto(), { authorId: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22' });
  expect((await validate(valid)).some(error => error.property === 'authorId')).toBe(false);
});
