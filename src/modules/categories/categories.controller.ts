import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post as HttpPost,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { CategoriesService } from './categories.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { FindCategoriesQueryDto } from './dto/find-categories-query.dto.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../users/enums/user.enum.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';

import {
  ApiCategoriesTag,
  ApiFindAllCategoriesDoc,
  ApiFindCategoryByIdOrSlugDoc,
  ApiFindPostsByCategoryDoc,
  ApiCreateCategoryDoc,
  ApiUpdateCategoryDoc,
  ApiRemoveCategoryDoc,
} from '../../docs/index.js';

@ApiCategoriesTag()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @ApiFindAllCategoriesDoc()
  @Get()
  findAll(@Query() query: FindCategoriesQueryDto) {
    return this.categoriesService.findAll(query);
  }

  @ApiFindCategoryByIdOrSlugDoc()
  @Get(':idOrSlug')
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.categoriesService.findByIdOrSlug(idOrSlug);
  }

  @ApiFindPostsByCategoryDoc()
  @Get(':idOrSlug/posts')
  findPostsByCategory(
    @Param('idOrSlug') idOrSlug: string,
    @Query() paginationQuery: PaginationQueryDto,
  ) {
    return this.categoriesService.findPostsByCategory(
      idOrSlug,
      paginationQuery,
    );
  }

  @ApiCreateCategoryDoc()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpPost()
  create(
    @Body() createCategoryDto: CreateCategoryDto,
    @Req() request: RequestWithUser,
  ) {
    return this.categoriesService.create(
      createCategoryDto,
      request.user.userId,
    );
  }

  @ApiUpdateCategoryDoc()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @ApiRemoveCategoryDoc()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.remove(id);
  }
}
