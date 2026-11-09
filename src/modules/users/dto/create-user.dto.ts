import { ApiProperty } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'Nome completo do usuário',
    example: 'João da Silva',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'Endereço de e-mail válido e único',
    example: 'joao.silva@example.com',
    maxLength: 255,
  })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    description: 'Senha de acesso do usuário',
    example: 'SenhaForte123!',
    minLength: 8,
    maxLength: 72,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiProperty({
    description: 'Data de nascimento no formato AAAA-MM-DD',
    example: '1995-05-20',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data de nascimento deve estar no formato AAAA-MM-DD.' })
  birthDate: string;

  @ApiProperty({
    description: 'Declaração de maioridade e aceite dos Termos de Uso e Política de Privacidade',
    example: true,
  })
  @IsBoolean()
  @Equals(true, { message: 'É obrigatório aceitar os Termos de Uso e a Política de Privacidade.' })
  acceptedTerms: boolean;

  @ApiProperty({
    description: 'Versão dos Termos de Uso aceita',
    example: '1.0.0',
    required: false,
  })
  @IsOptional()
  @IsString()
  termsVersion?: string;
}
