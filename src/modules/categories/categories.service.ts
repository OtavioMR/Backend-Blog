import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { isUUID } from 'class-validator';

import { Category } from './entities/category.entity.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { FindCategoriesQueryDto } from './dto/find-categories-query.dto.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import type { PaginatedResult } from '../../common/interfaces/paginated-result.interface.js';
import { PostsService } from '../posts/posts.service.js';
import { Post } from '../posts/entities/post.entity.js';
import { slugify } from '../../common/utils/slugify.util.js';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    private readonly postsService: PostsService,
  ) {}

  async create(
    createCategoryDto: CreateCategoryDto,
    creatorId?: string,
  ): Promise<Category> {
    const name = createCategoryDto.name.trim();
    const slug = createCategoryDto.slug
      ? slugify(createCategoryDto.slug)
      : slugify(name);

    const existingByName = await this.categoriesRepository.findOne({
      where: { name },
      withDeleted: true,
    });

    if (existingByName) {
      if (existingByName.isActive) {
        throw new ConflictException(
          `Já existe uma categoria ativa cadastrada com o nome "${name}".`,
        );
      }

      // Reativação automática da categoria desativada
      existingByName.isActive = true;
      existingByName.deletedAt = null;
      if (createCategoryDto.description !== undefined) {
        existingByName.description =
          createCategoryDto.description?.trim() ?? null;
      }
      existingByName.slug = slug;
      if (creatorId) {
        existingByName.creatorId = creatorId;
      }

      return this.categoriesRepository.save(existingByName);
    }

    const existingBySlug = await this.categoriesRepository.findOne({
      where: { slug },
      withDeleted: true,
    });

    if (existingBySlug) {
      if (existingBySlug.isActive) {
        throw new ConflictException(
          `Já existe uma categoria ativa cadastrada com o slug "${slug}".`,
        );
      }

      // Reativação automática da categoria desativada pelo slug
      existingBySlug.isActive = true;
      existingBySlug.deletedAt = null;
      existingBySlug.name = name;
      if (createCategoryDto.description !== undefined) {
        existingBySlug.description =
          createCategoryDto.description?.trim() ?? null;
      }
      if (creatorId) {
        existingBySlug.creatorId = creatorId;
      }

      return this.categoriesRepository.save(existingBySlug);
    }

    const category = this.categoriesRepository.create({
      name,
      description: createCategoryDto.description?.trim() ?? null,
      slug,
      isActive: true,
      creatorId: creatorId ?? null,
    });

    return this.categoriesRepository.save(category);
  }

  async findAll(
    query?: FindCategoriesQueryDto,
  ): Promise<PaginatedResult<Category>> {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 10;
    const skip = (page - 1) * limit;

    const queryBuilder = this.categoriesRepository
      .createQueryBuilder('category')
      .where('category.isActive = :isActive', { isActive: true });

    if (query?.search && query.search.trim().length > 0) {
      const term = `%${query.search.trim()}%`;
      queryBuilder.andWhere(
        '(category.name ILIKE :term OR category.slug ILIKE :term)',
        { term },
      );
    }

    queryBuilder
      .orderBy('category.name', 'ASC')
      .skip(skip)
      .take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findByIdOrSlug(idOrSlug: string): Promise<Category> {
    const isIdUuid = isUUID(idOrSlug, '4');

    const category = await this.categoriesRepository.findOne({
      where: isIdUuid
        ? { id: idOrSlug, isActive: true }
        : { slug: idOrSlug, isActive: true },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada.');
    }

    return category;
  }

  async findPostsByCategory(
    idOrSlug: string,
    paginationQuery?: PaginationQueryDto,
  ): Promise<PaginatedResult<Post>> {
    const category = await this.findByIdOrSlug(idOrSlug);

    return this.postsService.findAll({
      page: paginationQuery?.page,
      limit: paginationQuery?.limit,
      categoryId: category.id,
    });
  }

  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
  ): Promise<Category> {
    const category = await this.categoriesRepository.findOne({
      where: { id, isActive: true },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada.');
    }

    if (
      updateCategoryDto.name &&
      updateCategoryDto.name.trim() !== category.name
    ) {
      const newName = updateCategoryDto.name.trim();
      const existingByName = await this.categoriesRepository.findOne({
        where: { name: newName, id: Not(id) },
        withDeleted: true,
      });

      if (existingByName) {
        throw new ConflictException(
          `Já existe outra categoria com o nome "${newName}".`,
        );
      }

      category.name = newName;

      // Se o slug não foi passado explicitamente, atualiza junto com o nome
      if (!updateCategoryDto.slug) {
        const newSlug = slugify(newName);
        const existingBySlug = await this.categoriesRepository.findOne({
          where: { slug: newSlug, id: Not(id) },
          withDeleted: true,
        });

        if (existingBySlug) {
          throw new ConflictException(
            `Já existe outra categoria com o slug "${newSlug}".`,
          );
        }

        category.slug = newSlug;
      }
    }

    if (updateCategoryDto.slug) {
      const newSlug = slugify(updateCategoryDto.slug);
      if (newSlug !== category.slug) {
        const existingBySlug = await this.categoriesRepository.findOne({
          where: { slug: newSlug, id: Not(id) },
          withDeleted: true,
        });

        if (existingBySlug) {
          throw new ConflictException(
            `Já existe outra categoria com o slug "${newSlug}".`,
          );
        }

        category.slug = newSlug;
      }
    }

    if (updateCategoryDto.description !== undefined) {
      category.description = updateCategoryDto.description?.trim() ?? null;
    }

    if (updateCategoryDto.isActive !== undefined) {
      category.isActive = updateCategoryDto.isActive;
    }

    return this.categoriesRepository.save(category);
  }

  async remove(id: string): Promise<void> {
    const category = await this.categoriesRepository.findOne({
      where: { id, isActive: true },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada.');
    }

    category.isActive = false;
    await this.categoriesRepository.save(category);
    await this.categoriesRepository.softRemove(category);
  }
}
