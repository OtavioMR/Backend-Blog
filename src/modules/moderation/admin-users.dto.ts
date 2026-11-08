import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { UserRole } from '../users/enums/user.enum.js';

export class AdminUsersQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca por nome, e-mail ou UUID.', maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255) search?: string;
  @ApiPropertyOptional({ enum: UserRole }) @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @ApiPropertyOptional({ enum: ['active', 'suspended', 'inactive'] }) @IsOptional() @IsIn(['active', 'suspended', 'inactive']) status?: 'active' | 'suspended' | 'inactive';
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() createdFrom?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() createdTo?: string;
  @ApiPropertyOptional({ enum: ['createdAt', 'name'], default: 'createdAt' }) @IsOptional() @IsIn(['createdAt', 'name']) sort?: 'createdAt' | 'name';
  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' }) @IsOptional() @IsIn(['ASC', 'DESC']) order?: 'ASC' | 'DESC';
}
export class BlockedAuthorQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ maxLength: 255 }) @IsOptional() @IsString() @MaxLength(255) search?: string;
  @ApiPropertyOptional({ enum: ['requested', 'all'] }) @IsOptional() @IsIn(['requested', 'all']) filter?: 'requested' | 'all';
}
