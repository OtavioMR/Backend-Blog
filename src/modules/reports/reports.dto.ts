import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ReportStatus, ReportTarget } from './reports.entity.js';

export class CreateReportDto {
  @ApiProperty({ enum: ReportTarget, example: ReportTarget.POST }) @IsEnum(ReportTarget) target: ReportTarget;
  @ApiProperty({ format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }) @IsUUID() targetId: string;
  @ApiProperty({ minLength: 5, maxLength: 1000, example: 'Conteúdo ofensivo' }) @IsString() @MinLength(5) @MaxLength(1000) reason: string;
}
export class ReviewReportDto {
  @ApiProperty({ enum: [ReportStatus.RESOLVED, ReportStatus.DISMISSED], example: ReportStatus.RESOLVED }) @IsEnum({ RESOLVED: ReportStatus.RESOLVED, DISMISSED: ReportStatus.DISMISSED }) status: ReportStatus.RESOLVED | ReportStatus.DISMISSED;
  @ApiPropertyOptional({ maxLength: 1000, example: 'Conteúdo analisado' }) @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
export class ListReportsDto {
  @ApiPropertyOptional({ enum: ReportStatus }) @IsOptional() @IsEnum(ReportStatus) status?: ReportStatus;
  @ApiPropertyOptional({ default: 1, minimum: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
