import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CommentsService } from './comments.service.js';
import { UserRole } from '../users/enums/user.enum.js';

describe('CommentsService', () => {
  const author = { id: 'author', name: 'Ana', profilePhoto: null };
  const user = {
    userId: 'author',
    email: 'a@example.com',
    role: UserRole.READER,
  };
  let comments: any;
  let posts: any;
  let service: CommentsService;
  beforeEach(() => {
    comments = {
      findOne: vi.fn(),
      findAndCount: vi.fn(),
      create: vi.fn((x) => x),
      save: vi.fn(async (x) => x),
    };
    posts = {
      findOne: vi
        .fn()
        .mockResolvedValue({
          id: 'post',
          authorId: 'owner',
          commentsEnabled: true,
        }),
    };
    service = new CommentsService(comments, posts);
  });

  it('preserves author and hides content of disabled comments', async () => {
    comments.findAndCount
      .mockResolvedValueOnce([
        [
          {
            id: 'c',
            postId: 'post',
            author,
            content: 'secret',
            isActive: false,
          },
        ],
        1,
      ])
      .mockResolvedValueOnce([[], 0]);
    const result = await service.list('post');
    expect(result.data[0]).toMatchObject({
      author: { id: 'author', name: 'Ana' },
      content: 'Comentário excluído',
      isActive: false,
    });
  });

  it('rejects replies to disabled comments', async () => {
    comments.findOne.mockResolvedValue({
      id: 'c',
      postId: 'post',
      isActive: false,
    });
    await expect(
      service.create('post', { content: 'Oi', replyToId: 'c' }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks access when comments are disabled on the post', async () => {
    posts.findOne.mockResolvedValue({ commentsEnabled: false });
    await expect(service.list('post')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows the post author to deactivate a comment without deleting it', async () => {
    const comment = {
      id: 'c',
      postId: 'post',
      authorId: 'author',
      author,
      isActive: true,
      content: 'Olá',
    };
    comments.findOne.mockResolvedValue(comment);
    await service.remove('c', { ...user, userId: 'owner' });
    expect(comments.save).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Olá', isActive: false }),
    );
  });

  it('blocks editing by unrelated users', async () => {
    comments.findOne.mockResolvedValue({
      postId: 'post',
      authorId: 'author',
      isActive: true,
    });
    await expect(
      service.update('c', 'novo', { ...user, userId: 'other' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
