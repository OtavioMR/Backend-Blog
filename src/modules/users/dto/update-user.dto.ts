import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto.js';
import { UserRole } from '../enums/user.enum.js';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({
    description: 'Papel do usuário (apenas administradores podem alterar)',
    enum: UserRole,
    example: UserRole.AUTHOR,
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'Status ativo do usuário',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
