import { plainToInstance, Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
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
  return variables;
}
