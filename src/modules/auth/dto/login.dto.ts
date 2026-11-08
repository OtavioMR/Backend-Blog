import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, IsOptional, Matches } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Endereço de e-mail do usuário cadastrado',
    example: 'joao.silva@example.com',
    maxLength: 255,
  })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    description: 'Senha de acesso do usuário',
    example: 'SenhaForte123!',
    maxLength: 72,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password: string;
  @ApiPropertyOptional({ description: 'Código de seis dígitos do autenticador ou código de recuperação de uso único (xxxx-xxxx). Se omitido com 2FA ativo, o login retorna um desafio temporário.', example: '123456' })
  @IsOptional() @Matches(/^(\d{6}|[a-fA-F0-9]{4}-?[a-fA-F0-9]{4})$/) totpCode?: string;
}
