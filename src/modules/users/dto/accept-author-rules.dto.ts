import { ApiProperty } from '@nestjs/swagger';
import { Equals } from 'class-validator';
export class AcceptAuthorRulesDto {
  @ApiProperty({ example: '1', description: 'Versão das regras consultadas.' }) @Equals('1') version: '1';
  @ApiProperty({ example: true, description: 'Confirmação explícita do aceite.' }) @Equals(true) accepted: true;
}
