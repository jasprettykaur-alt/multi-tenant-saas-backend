import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser, JwtPayload } from '../../common/interfaces/auth-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret')!,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account is inactive or no longer exists');
    }

    if (user.tenant && user.tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException('Tenant account is suspended or disabled');
    }

    // Re-derive role/tenantId from the DB rather than trusting the token body
    // verbatim, so a revoked/downgraded user is rejected immediately.
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };
  }
}
