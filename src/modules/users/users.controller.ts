import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';

import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserRole } from './enums/user.enum.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { ForgotPasswordDto } from '../auth/dto/forgot-password.dto.js';
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto.js';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import {
  ApiUsersTag,
  ApiCreateUserDoc,
  ApiFindAllUsersDoc,
  ApiFindUserByIdDoc,
  ApiUpdateUserDoc,
  ApiRemoveUserDoc,
  ApiPublicRoute,
} from '../../docs/index.js';

@ApiUsersTag()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('confirm-email')
  @ApiPublicRoute()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  confirmEmail(@Body() dto: ConfirmEmailChangeDto) { return this.usersService.confirmEmail(dto.token); }

  @Post('resend-verification')
  @ApiPublicRoute()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resendVerification(@Body() dto: ForgotPasswordDto) { return this.usersService.resendVerification(dto.email); }

  @Post('confirm-email-change')
  @ApiPublicRoute()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirmar alteração de e-mail', description: 'Confirma o token de uso único enviado ao novo endereço; o token expira em 30 minutos.' })
  @ApiResponse({ status: 200, description: 'E-mail confirmado.' })
  @ApiResponse({ status: 400, description: 'Token inválido ou expirado.' })
  @ApiResponse({ status: 409, description: 'O endereço já está em uso.' })
  confirmEmailChange(@Body() dto: ConfirmEmailChangeDto) {
    return this.usersService.confirmEmailChange(dto.token);
  }

  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @Post(':id/profile-photo')
  uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Req() request: RequestWithUser,
  ) {
    if (!file) throw new BadRequestException('Envie uma imagem.');
    return this.usersService.updateProfilePhoto(id, file.buffer, request.user);
  }

  @ApiCreateUserDoc()
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @ApiFindAllUsersDoc()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAll(query);
  }

  @ApiFindUserByIdDoc()
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: RequestWithUser,
  ) {
    return this.usersService.findByIdForRequester(id, request.user);
  }

  @ApiUpdateUserDoc()
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() request: RequestWithUser,
  ) {
    return this.usersService.update(id, updateUserDto, request.user);
  }

  @ApiRemoveUserDoc()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: RequestWithUser,
  ) {
    return this.usersService.remove(id, request.user);
  }
}
