import { likePattern } from '../../common/utils/like-pattern.js';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { slugify } from '../../common/utils/slugify.util.js';
import { Tag } from './entities/tag.entity.js';
import { FindTagsQueryDto } from './dto/find-tags-query.dto.js';
import type { PaginatedResult } from '../../common/interfaces/paginated-result.interface.js';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagsRepository: Repository<Tag>,
  ) {}

  async resolveNames(names: string[]): Promise<Tag[]> {
    const bySlug = new Map<string, string>();
    for (const rawName of names) {
      const name = rawName.trim().replace(/\s+/g, ' ');
      const slug = slugify(name);
      if (!slug || slug.length > 60 || !name || name.length > 50) {
        throw new BadRequestException('Nome de tag inválido.');
      }
      if (!bySlug.has(slug)) bySlug.set(slug, name);
    }

    if (bySlug.size === 0) return [];

    await this.tagsRepository
      .createQueryBuilder()
      .insert()
      .into(Tag)
      .values([...bySlug].map(([slug, name]) => ({ slug, name })))
      .orIgnore()
      .execute();

    const tags = await this.tagsRepository.find({
      where: { slug: In([...bySlug.keys()]) },
    });
    return [...bySlug.keys()].map((slug) =>
      tags.find((tag) => tag.slug === slug)!,
    );
  }

  async findAll(query?: FindTagsQueryDto): Promise<PaginatedResult<Tag>> {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 10;
    const search = query?.search?.trim();

    const queryBuilder = this.tagsRepository.createQueryBuilder('tag');
    if (search) {
      queryBuilder.where(`(unaccent(tag.name) ILIKE unaccent(:term) ESCAPE '\\' OR unaccent(tag.slug) ILIKE unaccent(:term) ESCAPE '\\')`, {
        term: likePattern(search),
      });
    }

    const [data, total] = await queryBuilder
      .orderBy('tag.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
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

  async findBySlug(slug: string): Promise<Tag> {
    const tag = await this.tagsRepository.findOne({ where: { slug } });
    if (!tag) throw new NotFoundException('Tag não encontrada.');
    return tag;
  }
}
