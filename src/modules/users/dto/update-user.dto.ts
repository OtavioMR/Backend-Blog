import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, IsNotEmpty, ValidateIf } from 'class-validator';
import { CreateUserDto } from './create-user.dto.js';
import { UserRole } from '../enums/user.enum.js';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({ description: 'Senha atual, obrigatória para alterar senha ou e-mail', writeOnly: true })
  @ValidateIf((dto: UpdateUserDto) => dto.password !== undefined || dto.email !== undefined || dto.currentPassword !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  currentPassword?: string;

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
