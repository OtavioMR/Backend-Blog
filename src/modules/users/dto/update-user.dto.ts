import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, IsNotEmpty, ValidateIf, IsUrl } from 'class-validator';
import { CreateUserDto } from './create-user.dto.js';
import { UserRole } from '../enums/user.enum.js';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({ description: 'Biografia pública; null remove o valor.', example: 'Autora de tecnologia', nullable: true, maxLength: 500 })
  @IsOptional() @IsString() @MaxLength(500)
  bio?: string | null;

  @ApiPropertyOptional({ description: 'Site público; null remove o valor.', example: 'https://example.com', nullable: true })
  @IsOptional() @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) @MaxLength(500)
  websiteUrl?: string | null;

  @ApiPropertyOptional({ description: 'Link social público; null remove o valor.', example: 'https://example.com/perfil', nullable: true })
  @IsOptional() @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) @MaxLength(500)
  socialUrl?: string | null;

  @ApiPropertyOptional({ description: 'Senha atual, obrigatória para alterar senha ou e-mail', writeOnly: true })
  @ValidateIf((dto: UpdateUserDto) => dto.password !== undefined || dto.email !== undefined || dto.currentPassword !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  currentPassword?: string;

  @ApiPropertyOptional({
    description: 'Não é aceito nesta rota. Alterações de função usam PATCH /admin/users/:id/role.',
    enum: UserRole,
    example: UserRole.AUTHOR,
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'Não é aceito nesta rota. Use as rotas administrativas de suspensão e restauração.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
