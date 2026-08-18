import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ASSIGNABLE_ROLES } from './create-user.dto';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'John Smith' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ enum: ASSIGNABLE_ROLES })
  @IsOptional()
  @IsEnum(Role)
  @IsIn(ASSIGNABLE_ROLES)
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
