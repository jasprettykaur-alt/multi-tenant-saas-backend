import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { JwtPayload } from '../common/interfaces/auth-user.interface';
import { parseDurationToMs } from '../common/utils/time.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const SALT_ROUNDS = 12;

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    tenantId: string | null;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async register(dto: RegisterDto, ip?: string): Promise<AuthResult> {
    const existingSlug = await this.prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } });
    if (existingSlug) {
      throw new ConflictException('Tenant slug is already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const { tenant, user } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.tenantName, slug: dto.tenantSlug },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email.toLowerCase(),
          passwordHash,
          name: dto.name,
          role: Role.TENANT_ADMIN,
        },
      });

      return { tenant, user };
    });

    await this.auditLogsService.record({
      tenantId: tenant.id,
      userId: user.id,
      action: AuditAction.TENANT_CREATED,
      resource: 'tenant',
      resourceId: tenant.id,
      ip,
    });
    await this.auditLogsService.record({
      tenantId: tenant.id,
      userId: user.id,
      action: AuditAction.USER_CREATED,
      resource: 'user',
      resourceId: user.id,
      ip,
      metadata: { role: user.role, selfRegistered: true },
    });

    const tokens = await this.issueTokens(user.id, user.email, user.role, user.tenantId);

    await this.auditLogsService.record({
      tenantId: tenant.id,
      userId: user.id,
      action: AuditAction.LOGIN_SUCCESS,
      resource: 'auth',
      ip,
    });

    return {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId },
    };
  }

  async login(dto: LoginDto, ip?: string): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    let candidateUser: Awaited<ReturnType<typeof this.prisma.user.findFirst>> = null;

    if (dto.tenantSlug) {
      const tenant = await this.prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } });
      if (tenant) {
        candidateUser = await this.prisma.user.findFirst({ where: { tenantId: tenant.id, email } });
      }
    } else {
      const matches = await this.prisma.user.findMany({ where: { email }, take: 2 });
      if (matches.length > 1) {
        throw new UnauthorizedException(
          'This email is registered under multiple tenants; please provide tenantSlug',
        );
      }
      candidateUser = matches[0] ?? null;
    }

    if (!candidateUser) {
      await this.auditLogsService.record({
        tenantId: null,
        userId: null,
        action: AuditAction.LOGIN_FAILED,
        resource: 'auth',
        ip,
        metadata: { email },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, candidateUser.passwordHash);
    if (!passwordValid || !candidateUser.isActive) {
      await this.auditLogsService.record({
        tenantId: candidateUser.tenantId,
        userId: candidateUser.id,
        action: AuditAction.LOGIN_FAILED,
        resource: 'auth',
        ip,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (candidateUser.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: candidateUser.tenantId } });
      if (!tenant || tenant.status !== 'ACTIVE') {
        throw new UnauthorizedException('Tenant account is suspended or disabled');
      }
    }

    const tokens = await this.issueTokens(
      candidateUser.id,
      candidateUser.email,
      candidateUser.role,
      candidateUser.tenantId,
    );

    await this.auditLogsService.record({
      tenantId: candidateUser.tenantId,
      userId: candidateUser.id,
      action: AuditAction.LOGIN_SUCCESS,
      resource: 'auth',
      ip,
    });

    return {
      ...tokens,
      user: {
        id: candidateUser.id,
        email: candidateUser.email,
        name: candidateUser.name,
        role: candidateUser.role,
        tenantId: candidateUser.tenantId,
      },
    };
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    let payload: { sub: string; jti: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(payload.jti);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, tokenHash, revoked: false },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has been revoked or expired');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account is inactive or no longer exists');
    }

    // Rotation: invalidate the used refresh token before issuing a new one.
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });

    const tokens = await this.issueTokens(user.id, user.email, user.role, user.tenantId);

    return {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId },
    };
  }

  async logout(userId: string, refreshToken?: string): Promise<{ success: true }> {
    if (refreshToken) {
      try {
        const payload = await this.jwtService.verifyAsync<{ sub: string; jti: string }>(refreshToken, {
          secret: this.configService.get<string>('jwt.refreshSecret'),
        });
        await this.prisma.refreshToken.updateMany({
          where: { userId: payload.sub, tokenHash: this.hashToken(payload.jti) },
          data: { revoked: true },
        });
        return { success: true };
      } catch {
        // fall through to revoke-all below if the provided token is malformed
      }
    }

    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
    return { success: true };
  }

  private async issueTokens(userId: string, email: string, role: Role, tenantId: string | null) {
    const payload: JwtPayload = { sub: userId, email, role, tenantId };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: this.configService.get<string>('jwt.expiresIn'),
    });

    const jti = randomUUID();
    const refreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn')!;
    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, jti },
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: refreshExpiresIn,
      },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(jti),
        expiresAt: new Date(Date.now() + parseDurationToMs(refreshExpiresIn)),
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
