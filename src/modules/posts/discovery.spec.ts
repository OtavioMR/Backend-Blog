import { describe, expect, it, vi } from 'vitest';
import { PostsService } from './posts.service.js';
import { UserRole } from '../users/enums/user.enum.js';

describe('descoberta de conteúdo', () => {
  it('ordena relacionados por tags e categorias compartilhadas e exclui o pr?prio artigo', async () => {
    const tag = { id: 't' }; const category = { id: 'c', isActive: true };
    const target = { id: 'a', tags: [tag], categories: [category] };
    const one = { id: 'b', tags: [tag], categories: [], publishedAt: new Date() };
    const two = { id: 'c', tags: [tag], categories: [category], publishedAt: new Date() };
    const repo = { findOne: vi.fn().mockResolvedValue(target), find: vi.fn().mockResolvedValue([target, one, two]) };
    const service = new PostsService(repo as never, {} as never, {} as never);
    vi.spyOn(service, 'findById').mockImplementation(async id => ({ id } as never));
    expect((await service.findRelated('slug')).map(p => p.id)).toEqual(['c', 'b']);
    expect(repo.find.mock.calls[0][0].where).toEqual(expect.arrayContaining([expect.objectContaining({ published: true, isActive: true })]));
  });
  it('limita recomendações a quatro artigos', async () => {
    const tag = { id: 't' };
    const target = { id: 'target', tags: [tag], categories: [] };
    const related = Array.from({ length: 6 }, (_, index) => ({ id: `post-${index}`, tags: [tag], categories: [], publishedAt: new Date() }));
    const repo = { findOne: vi.fn().mockResolvedValue(target), find: vi.fn().mockResolvedValue([target, ...related]) };
    const service = new PostsService(repo as never, {} as never, {} as never);
    vi.spyOn(service, 'findById').mockImplementation(async id => ({ id } as never));
    expect(await service.findRelated('target')).toHaveLength(4);
  });
  it('retorna somente dados públicos e conta publica??es ativas', async () => {
    const findOne = vi.fn().mockResolvedValue({ id: 'a', name: 'Ana', role: UserRole.AUTHOR, email: 'private', bio: null });
    const count = vi.fn().mockResolvedValue(3);
    const repo = { manager: { getRepository: () => ({ findOne }) }, count };
    const service = new PostsService(repo as never, {} as never, {} as never);
    const profile = await service.authorProfile('a');
    expect(profile).toMatchObject({ id: 'a', publicationCount: 3 });
    expect(profile).not.toHaveProperty('email');
    expect(count).toHaveBeenCalledWith({ where: { authorId: 'a', published: true, isActive: true } });
  });
});
