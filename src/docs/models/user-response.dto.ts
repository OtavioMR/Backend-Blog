import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../modules/users/enums/user.enum.js';

export class UserResponseDto {
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

  @ApiProperty({
    description: 'Papel/permissão do usuário no sistema',
    enum: UserRole,
    example: UserRole.READER,
  })
  role: UserRole;

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
