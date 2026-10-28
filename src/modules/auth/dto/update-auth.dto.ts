import { PartialType } from '@nestjs/mapped-types';
import { LoginDto } from './login.dto.js';

export class UpdateAuthDto extends PartialType(LoginDto) {}
