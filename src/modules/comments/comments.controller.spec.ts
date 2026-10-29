import { Test } from '@nestjs/testing';
import {
  CommentsController,
  PostCommentsController,
} from './comments.controller.js';
import { CommentsService } from './comments.service.js';

describe('Comments controllers', () => {
  it('registers both controllers with the service', async () => {
    const module = await Test.createTestingModule({
      controllers: [CommentsController, PostCommentsController],
      providers: [{ provide: CommentsService, useValue: {} }],
    }).compile();
    expect(module.get(CommentsController)).toBeDefined();
    expect(module.get(PostCommentsController)).toBeDefined();
  });
});
