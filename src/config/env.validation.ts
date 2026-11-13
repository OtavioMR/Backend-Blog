import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

const toNumber = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() !== '' ? Number(value) : value;

export class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: string;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  DB_HOST: string;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  DB_USER: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  DB_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  DB_NAME: string;

  @Transform(({ value }: { value: unknown }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  DB_SSL = false;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  DB_SSL_CA?: string;

  @IsString()
  @MinLength(32)
  @Matches(/^\S+$/)
  JWT_SECRET: string;

  @IsString()
  @MinLength(32)
  @Matches(/^\S+$/)
  JWT_REFRESH_SECRET: string;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  JWT_EXPIRES_IN = 900;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  JWT_REFRESH_EXPIRES_IN = 604800;

  @IsUrl({
    require_protocol: true,
    require_tld: false,
    protocols: ['http', 'https'],
  })
  FRONTEND_URL: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, require_tld: false, protocols: ['http', 'https'] })
  PUBLIC_API_URL?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  SMTP_HOST: string;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  SMTP_USER: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  SMTP_PASS: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  SMTP_FROM: string;

  @IsUrl({ require_protocol: true, require_tld: false, protocols: ['redis', 'rediss'] })
  @Matches(/^rediss?:\/\/[^/?#]+(?:\/\d+)?$/)
  REDIS_URL = 'redis://127.0.0.1:6379';

  @IsOptional()
  @IsString()
  CONTACT_SUPPORT_EMAIL = 'suporte@griforio.com.br';

  @IsOptional()
  @IsString()
  CONTACT_PRIVACY_EMAIL = 'privacidade@griforio.com.br';

  @IsOptional()
  @IsString()
  CONTACT_REPORTS_EMAIL = 'denuncias@griforio.com.br';

  @IsOptional()
  @IsIn(['local', 'vercel-blob'])
  STORAGE_DRIVER = 'local';

  @IsOptional()
  @IsString()
  BLOB_READ_WRITE_TOKEN?: string;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const variables = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(variables, {
    validationError: { target: false, value: false },
  });
  if (errors.length) {
    throw new Error(
      `Invalid environment configuration: ${errors.map((error) => `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`).join('; ')}`,
    );
  }
  if (variables.NODE_ENV === 'production') {
    if (variables.JWT_SECRET === variables.JWT_REFRESH_SECRET) {
      throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be distinct in production');
    }
    if (new URL(variables.FRONTEND_URL).protocol !== 'https:') {
      throw new Error('FRONTEND_URL must use HTTPS in production');
    }
  }
  if (variables.STORAGE_DRIVER === 'vercel-blob' && !variables.BLOB_READ_WRITE_TOKEN?.trim()) {
    throw new Error('BLOB_READ_WRITE_TOKEN is required for STORAGE_DRIVER=vercel-blob');
  }
  return variables;
}
