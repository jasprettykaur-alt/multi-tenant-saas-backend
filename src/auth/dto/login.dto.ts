import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'jane@acme.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongP@ssw0rd' })
  @IsString()
  password!: string;

  @ApiPropertyOptional({
    example: 'acme-corp',
    description: 'Required if the email is registered under more than one tenant',
  })
  @IsOptional()
  @IsString()
  tenantSlug?: string;
}
