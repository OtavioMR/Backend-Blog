import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
export class ConfirmRegistrationDto {
  @ApiProperty({ description: 'C\u00f3digo de seis d\u00edgitos ou token anterior', example: '012345' })
  @IsString() @Matches(/^(?:\d{6}|[a-f0-9]{64})$/)
  token: string;
  @ApiPropertyOptional({ description: 'E-mail da conta, obrigat\u00f3rio para c\u00f3digos', example: 'reader@example.com' })
  @IsOptional() @IsEmail() @MaxLength(255)
  email?: string;
}
