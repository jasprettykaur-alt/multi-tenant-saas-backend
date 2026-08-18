import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TenantPlan } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateTenantDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'acme-corp' })
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with single hyphens (e.g. acme-corp)',
  })
  @MinLength(2)
  @MaxLength(50)
  slug!: string;

  @ApiPropertyOptional({ enum: TenantPlan, default: TenantPlan.FREE })
  @IsOptional()
  @IsEnum(TenantPlan)
  plan?: TenantPlan;
}
