import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, TenantStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../src/auth/auth.service';
import { AuditLogsService } from '../../src/audit-logs/audit-logs.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: jest.Mocked<any>;
  let jwtService: jest.Mocked<Partial<JwtService>>;
  let configService: jest.Mocked<Partial<ConfigService>>;
  let auditLogsService: jest.Mocked<Partial<AuditLogsService>>;

  const fakeTenant = {
    id: 'tenant-1',
    name: 'Acme Corp',
    slug: 'acme-corp',
    status: TenantStatus.ACTIVE,
  };

  beforeEach(() => {
    prisma = {
      tenant: { findUnique: jest.fn() },
      user: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      refreshToken: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
      verifyAsync: jest.fn(),
    };

    configService = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          'jwt.secret': 'secret',
          'jwt.expiresIn': '15m',
          'jwt.refreshSecret': 'refresh-secret',
          'jwt.refreshExpiresIn': '7d',
        };
        return map[key];
      }),
    };

    auditLogsService = { record: jest.fn().mockResolvedValue(undefined) };

    authService = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
      auditLogsService as unknown as AuditLogsService,
    );
  });

  describe('register', () => {
    it('rejects a tenant slug that is already taken', async () => {
      prisma.tenant.findUnique.mockResolvedValue(fakeTenant);

      await expect(
        authService.register({
          tenantName: 'Acme Corp',
          tenantSlug: 'acme-corp',
          name: 'Alice',
          email: 'alice@acme.com',
          password: 'StrongP@ss1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a tenant and its first Tenant Admin, returning tokens', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      const createdUser = {
        id: 'user-1',
        tenantId: fakeTenant.id,
        email: 'alice@acme.com',
        name: 'Alice',
        role: Role.TENANT_ADMIN,
      };
      prisma.$transaction.mockImplementation(async (cb: any) =>
        cb({
          tenant: { create: jest.fn().mockResolvedValue(fakeTenant) },
          user: { create: jest.fn().mockResolvedValue(createdUser) },
        }),
      );
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await authService.register({
        tenantName: 'Acme Corp',
        tenantSlug: 'acme-corp',
        name: 'Alice',
        email: 'alice@acme.com',
        password: 'StrongP@ss1',
      });

      expect(result.user.role).toBe(Role.TENANT_ADMIN);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(auditLogsService.record).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException when no user matches the email', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await expect(
        authService.login({ email: 'nobody@acme.com', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException on wrong password', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword1', 10);
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-1', tenantId: 'tenant-1', email: 'alice@acme.com', passwordHash, isActive: true },
      ]);

      await expect(
        authService.login({ email: 'alice@acme.com', password: 'WrongPassword' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('requires tenantSlug when the same email exists under multiple tenants', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-1', tenantId: 'tenant-1' },
        { id: 'user-2', tenantId: 'tenant-2' },
      ]);

      await expect(authService.login({ email: 'shared@example.com', password: 'x' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('issues tokens on valid credentials', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword1', 10);
      const user = {
        id: 'user-1',
        tenantId: 'tenant-1',
        email: 'alice@acme.com',
        name: 'Alice',
        role: Role.TENANT_ADMIN,
        passwordHash,
        isActive: true,
      };
      prisma.user.findMany.mockResolvedValue([user]);
      prisma.tenant.findUnique.mockResolvedValue(fakeTenant);
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await authService.login({ email: 'alice@acme.com', password: 'CorrectPassword1' });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user.email).toBe('alice@acme.com');
    });
  });

  describe('refresh', () => {
    it('rejects an invalid/expired refresh token', async () => {
      (jwtService.verifyAsync as jest.Mock).mockRejectedValue(new Error('expired'));

      await expect(authService.refresh('bad-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a refresh token that has been revoked', async () => {
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({ sub: 'user-1', jti: 'jti-1' });
      prisma.refreshToken.findFirst.mockResolvedValue(null);

      await expect(authService.refresh('some-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
