import { validate } from 'class-validator';
import { FindPostsQueryDto } from './find-posts-query.dto.js';

it('rejects oversized text filters', async () => {
  for (const key of ['search', 'author', 'categoryName', 'categorySlug', 'tagSlug']) {
    const dto = Object.assign(new FindPostsQueryDto(), { [key]: 'x'.repeat(101) });
    expect((await validate(dto)).some(error => error.property === key)).toBe(true);
  }
});
