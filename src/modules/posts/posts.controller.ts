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

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { PostsService } from './posts.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { FindPostsQueryDto } from './dto/find-posts-query.dto.js';

import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../auth/guard/optional-jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../users/enums/user.enum.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import {
  ApiPostsTag,
  ApiFindAllPostsDoc,
  ApiFindMinePostsDoc,
  ApiFindPostByIdDoc,
  ApiCreatePostDoc,
  ApiUpdatePostDoc,
  ApiRemovePostDoc,
} from '../../docs/index.js';

@ApiPostsTag()
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @ApiFindAllPostsDoc()
  @Get()
  findAll(@Query() findPostsQuery: FindPostsQueryDto) {
    return this.postsService.findAll(findPostsQuery);
  }

  @ApiFindMinePostsDoc()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  findMine(@Query() query: PaginationQueryDto, @Req() request: RequestWithUser) {
    return this.postsService.findMine(request.user.userId, query);
  }

  @ApiFindPostByIdDoc()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string, @Req() request: RequestWithUser) {
    return this.postsService.findById(id, request.user);
  }

  @ApiCreatePostDoc()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.AUTHOR, UserRole.ADMIN)
  @HttpPost()
  create(
    @Body() createPostDto: CreatePostDto,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.create(createPostDto, request.user.userId);
  }

  @ApiUpdatePostDoc()
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePostDto: UpdatePostDto,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.update(id, updatePostDto, request.user);
  }

  @ApiRemovePostDoc()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.remove(id, request.user);
  }
}
