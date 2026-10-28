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

import { PostsService } from './posts.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import {
  ApiPostsTag,
  ApiFindAllPostsDoc,
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
  findAll(@Query() paginationQuery: PaginationQueryDto) {
    return this.postsService.findAll(paginationQuery);
  }

  @ApiFindPostByIdDoc()
  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.postsService.findById(id);
  }

  @ApiCreatePostDoc()
  @UseGuards(JwtAuthGuard)
  @HttpPost()
  create(
    @Body() createPostDto: CreatePostDto,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.create(
      createPostDto,
      request.user.userId,
    );
  }

  @ApiUpdatePostDoc()
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePostDto: UpdatePostDto,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.update(
      id,
      updatePostDto,
      request.user,
    );
  }

  @ApiRemovePostDoc()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.remove(
      id,
      request.user,
    );
  }
}
