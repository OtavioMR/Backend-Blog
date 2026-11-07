import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../modules/users/enums/user.enum.js';

export class UserResponseDto {
  @ApiPropertyOptional({ description: 'Estado da primeira aprovação editorial; presente somente ao consultar o próprio perfil por ID. Não substitui a autorização da API.', example: false })
  firstPostApproved?: boolean;

  @ApiProperty({
    description: 'Identificador único do usuário (UUID v4)',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  id: string;

  @ApiProperty({
    description: 'Nome completo do usuário',
    example: 'João da Silva',
  })
  name: string;

  @ApiProperty({
    description: 'Endereço de e-mail do usuário',
    example: 'joao.silva@example.com',
  })
  email: string;

  @ApiProperty({ description: 'Public biography', type: String, nullable: true })
  bio: string | null;

  @ApiProperty({ description: 'Public website', type: String, nullable: true })
  websiteUrl: string | null;

  @ApiProperty({ description: 'Public social link', type: String, nullable: true })
  socialUrl: string | null;

  @ApiProperty({
    description: 'Papel/permissão do usuário no sistema',
    enum: UserRole,
    example: UserRole.READER,
  })
  role: UserRole;

  @ApiProperty({ description: 'E-mail confirmado', example: true })
  emailVerified: boolean;

  @ApiProperty({
    description: 'Indica se o usuário está ativo no sistema',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Data e hora de criação do usuário',
    example: '2026-10-28T12:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Data e hora da última atualização do usuário',
    example: '2026-10-28T12:00:00.000Z',
  })
  updatedAt: Date;
}
