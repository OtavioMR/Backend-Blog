import {
  Body,
  Controller,
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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../users/enums/user.enum.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { ModerationService } from './moderation.service.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { AppealStatus, AppealTargetType } from './entities/moderation-appeal.entity.js';

export class CreateAppealDto {
  @ApiProperty({ enum: AppealTargetType, example: AppealTargetType.POST })
  @IsEnum(AppealTargetType)
  targetType: AppealTargetType;

  @ApiProperty({ format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsUUID('4')
  targetId: string;

  @ApiProperty({ minLength: 10, maxLength: 2000, example: 'Acredito que o conteúdo não violou as diretrizes porque...' })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason: string;
}

export class AssignAppealDto {
  @ApiProperty({ format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsUUID('4')
  moderatorId: string;
}

export class DecideAppealDto {
  @ApiProperty({ enum: [AppealStatus.ACCEPTED, AppealStatus.REJECTED], example: AppealStatus.ACCEPTED })
  @IsEnum([AppealStatus.ACCEPTED, AppealStatus.REJECTED])
  decision: AppealStatus.ACCEPTED | AppealStatus.REJECTED;

  @ApiProperty({ minLength: 5, maxLength: 1000, example: 'Após reanálise editorial, verificou-se adequação às diretrizes.' })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  decisionNotes: string;
}

export class AppealQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AppealStatus })
  @IsOptional()
  @IsEnum(AppealStatus)
  status?: AppealStatus;
}

@ApiTags('Recursos de Moderação')
@ApiBearerAuth('JWT-auth')
@Controller()
export class ModerationAppealsController {
  constructor(private readonly service: ModerationService) {}

  @UseGuards(JwtAuthGuard)
  @Post('moderation/appeals')
  @ApiOperation({
    summary: 'Submeter recurso contra decisão de moderação',
    description: 'Permite ao autor recorrer de ocultação de artigo, comentário ou ação editorial. Gera protocolo e prazo SLA de 15 dias.',
  })
  @ApiResponse({ status: 201, description: 'Recurso registrado com sucesso com protocolo GRIF-REC.' })
  createAppeal(@Req() req: RequestWithUser, @Body() dto: CreateAppealDto) {
    return this.service.createAppeal(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('moderation/appeals/my')
  @ApiOperation({ summary: 'Listar recursos do usuário autenticado' })
  listMyAppeals(@Req() req: RequestWithUser, @Query() query: PaginationQueryDto) {
    return this.service.listMyAppeals(req.user.userId, query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/moderation/appeals')
  @ApiOperation({ summary: 'Fila de recursos para moderação' })
  listAppeals(@Query() query: AppealQueryDto) {
    return this.service.listAppeals(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/moderation/appeals/:id/assign')
  @ApiOperation({
    summary: 'Designar moderador para recurso',
    description: 'Impede conflito de interesse: o moderador designado não pode ser o autor da ação original.',
  })
  assignAppeal(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestWithUser,
    @Body() dto: AssignAppealDto,
  ) {
    return this.service.assignAppeal(id, req.user.userId, dto.moderatorId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/moderation/appeals/:id/decide')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Decidir recurso de moderação',
    description: 'Aceita ou rejeita o recurso. Se aceito, reverte automaticamente a ação de moderação no conteúdo.',
  })
  decideAppeal(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestWithUser,
    @Body() dto: DecideAppealDto,
  ) {
    return this.service.decideAppeal(id, req.user.userId, dto.decision, dto.decisionNotes);
  }
}
