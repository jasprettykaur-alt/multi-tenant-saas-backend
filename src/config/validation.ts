import { plainToInstance } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV?: string;

  @IsOptional()
  @IsNumberString()
  PORT?: string;

  @IsNotEmpty()
  @IsString()
  DATABASE_URL!: string;

  @IsNotEmpty()
  @IsString()
  REDIS_URL!: string;

  @IsNotEmpty()
  @IsString()
  JWT_SECRET!: string;

  @IsNotEmpty()
  @IsString()
  REFRESH_TOKEN_SECRET!: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(
      `Config validation error: ${errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('; ')}`,
    );
  }
  return validatedConfig;
}
