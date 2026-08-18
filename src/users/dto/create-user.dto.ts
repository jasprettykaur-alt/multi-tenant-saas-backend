import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEmail, IsEnum, IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Users of a tenant may only ever be created with one of these roles. */
export const ASSIGNABLE_ROLES = [Role.TENANT_ADMIN, Role.MANAGER, Role.EMPLOYEE] as const;

export class CreateUserDto {
  @ApiProperty({ example: 'John Smith' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'john@acme.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongP@ssw0rd' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'password must contain at least one uppercase letter, one lowercase letter and one number',
  })
  password!: string;

  @ApiProperty({ enum: ASSIGNABLE_ROLES, example: Role.EMPLOYEE })
  @IsEnum(Role)
  @IsIn(ASSIGNABLE_ROLES)
  role!: Role;
}
