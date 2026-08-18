import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  tenantName!: string;

  @ApiProperty({ example: 'acme-corp', description: 'URL-safe unique tenant identifier' })
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with single hyphens (e.g. acme-corp)',
  })
  @MinLength(2)
  @MaxLength(50)
  tenantSlug!: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'jane@acme.com' })
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
}
