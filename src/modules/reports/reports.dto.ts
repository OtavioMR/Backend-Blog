import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ReportReason, ReportStatus, ReportTarget } from './reports.entity.js';

export class CreateReportDto {
  @ApiProperty({ enum: ReportTarget, example: ReportTarget.POST }) @IsEnum(ReportTarget) target: ReportTarget;
  @ApiProperty({ format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }) @IsUUID() targetId: string;
  @ApiProperty({ minLength: 5, maxLength: 1000, example: 'Conteúdo ofensivo' }) @IsString() @MinLength(5) @MaxLength(1000) reason: string;
  @ApiPropertyOptional({ enum: ReportReason, example: ReportReason.HARASSMENT }) @IsOptional() @IsEnum(ReportReason) reasonCategory?: ReportReason;
  @ApiPropertyOptional({ maxLength: 2000, example: 'Contexto adicional da denúncia.' }) @IsOptional() @IsString() @MaxLength(2000) description?: string;
}
export class ReviewReportDto {
  @ApiProperty({ enum: [ReportStatus.RESOLVED, ReportStatus.DISMISSED], example: ReportStatus.RESOLVED }) @IsEnum({ RESOLVED: ReportStatus.RESOLVED, DISMISSED: ReportStatus.DISMISSED }) status: ReportStatus.RESOLVED | ReportStatus.DISMISSED;
  @ApiProperty({ minLength: 5, maxLength: 1000, example: 'Conteúdo analisado e considerado impróprio.' }) @IsString() @MinLength(5) @MaxLength(1000) note: string;
}
export class ListReportsDto {
  @ApiPropertyOptional({ enum: ReportStatus }) @IsOptional() @IsEnum(ReportStatus) status?: ReportStatus;
  @ApiPropertyOptional({ enum: ReportTarget }) @IsOptional() @IsEnum(ReportTarget) target?: ReportTarget;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() moderatorId?: string;
  @ApiPropertyOptional({ enum: ['me', 'unassigned'], description: 'Casos atribuídos à sessão atual ou sem responsável.' }) @IsOptional() @IsIn(['me', 'unassigned']) assignee?: 'me' | 'unassigned';
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ default: 1, minimum: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
export class AssignReportDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Moderador de destino. Omita para assumir a análise com a identidade autenticada.' }) @IsOptional() @IsUUID() moderatorId?: string;
  @ApiPropertyOptional({ description: 'Libera a análise para a fila; permitido ao responsável ou SUPER_ADMIN.' }) @IsOptional() @IsBoolean() release?: boolean;
}
export class ResolveReportDto extends ReviewReportDto {
  @ApiProperty({ enum: ['NONE', 'HIDE_POST', 'HIDE_COMMENT'], example: 'NONE' }) @IsIn(['NONE', 'HIDE_POST', 'HIDE_COMMENT']) action: 'NONE' | 'HIDE_POST' | 'HIDE_COMMENT';
}
