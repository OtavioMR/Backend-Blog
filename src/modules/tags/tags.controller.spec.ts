import { Test, TestingModule } from '@nestjs/testing';
import { TagsController } from './tags.controller.js';
import { TagsService } from './tags.service.js';
import { vi } from 'vitest';

describe('TagsController', () => {
  let controller: TagsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TagsController],
      providers: [
        {
          provide: TagsService,
          useValue: { findAll: vi.fn(), findBySlug: vi.fn() },
        },
      ],
    }).compile();

    controller = module.get<TagsController>(TagsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
