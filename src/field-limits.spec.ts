import { validateSync } from 'class-validator';
import { CreateCommentDto } from './modules/comments/dto/create-comment.dto.js';
import { UpdateCommentDto } from './modules/comments/dto/update-comment.dto.js';
import { CreatePostDto } from './modules/posts/dto/create-post.dto.js';
import { CreateUserDto } from './modules/users/dto/create-user.dto.js';

function errorsFor(instance: object, field: string) {
  return validateSync(instance).filter(error => error.property === field);
}

describe('limites dos campos', () => {
  it.each([CreateCommentDto, UpdateCommentDto])('valida o limite de comentario em %s', Dto => {
    expect(errorsFor(Object.assign(new Dto(), { content: 'a'.repeat(1000) }), 'content')).toHaveLength(0);
    expect(errorsFor(Object.assign(new Dto(), { content: 'a'.repeat(1001) }), 'content')).toHaveLength(1);
  });
  it.each([['title', 150], ['content', 50000]] as const)('valida o limite de artigo: %s', (field, max) => {
    expect(errorsFor(Object.assign(new CreatePostDto(), { [field]: 'a'.repeat(max) }), field)).toHaveLength(0);
    expect(errorsFor(Object.assign(new CreatePostDto(), { [field]: 'a'.repeat(max + 1) }), field)).toHaveLength(1);
  });
  it.each([['name', 100], ['password', 72]] as const)('valida o limite de conta: %s', (field, max) => {
    expect(errorsFor(Object.assign(new CreateUserDto(), { [field]: 'a'.repeat(max) }), field)).toHaveLength(0);
    expect(errorsFor(Object.assign(new CreateUserDto(), { [field]: 'a'.repeat(max + 1) }), field)).toHaveLength(1);
  });
  it('aceita email longo valido e rejeita valor acima do limite', () => {
    const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
    expect(email.length).toBe(254);
    expect(errorsFor(Object.assign(new CreateUserDto(), { email }), 'email')).toHaveLength(0);
    expect(errorsFor(Object.assign(new CreateUserDto(), { email: email + 'xx' }), 'email')).toHaveLength(1);
  });
});
