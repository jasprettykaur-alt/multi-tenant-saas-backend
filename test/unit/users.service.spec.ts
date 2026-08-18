import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from '../../src/users/users.service';
import { AuditLogsService } from '../../src/audit-logs/audit-logs.service';
import { InvitationsService } from '../../src/jobs/invitations.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthenticatedUser } from '../../src/common/interfaces/auth-user.interface';

describe('UsersService', () => {
  let usersService: UsersService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<Partial<AuditLogsService>>;
  let invitationsService: jest.Mocked<Partial<InvitationsService>>;

  const tenantId = 'tenant-1';

  const managerActor: AuthenticatedUser = {
    userId: 'manager-1',
    email: 'manager@acme.com',
    role: Role.MANAGER,
    tenantId,
  };

  const tenantAdminActor: AuthenticatedUser = {
    userId: 'admin-1',
    email: 'admin@acme.com',
    role: Role.TENANT_ADMIN,
    tenantId,
  };

  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      tenant: { findUnique: jest.fn().mockResolvedValue({ name: 'Acme Corp' }) },
      $transaction: jest.fn(),
    };
    auditLogsService = { record: jest.fn().mockResolvedValue(undefined) };
    invitationsService = { enqueueInvitation: jest.fn().mockResolvedValue(undefined) };

    usersService = new UsersService(
      prisma as unknown as PrismaService,
      auditLogsService as unknown as AuditLogsService,
      invitationsService as unknown as InvitationsService,
    );
  });

  describe('create', () => {
    it('blocks a Manager from creating a Tenant Admin', async () => {
      await expect(
        usersService.create(
          tenantId,
          managerActor,
          { name: 'New Admin', email: 'newadmin@acme.com', password: 'StrongP@ss1', role: Role.TENANT_ADMIN },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('allows a Tenant Admin to create a Manager and enqueues an invitation email', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-2',
        tenantId,
        email: 'newmanager@acme.com',
        name: 'New Manager',
        role: Role.MANAGER,
        passwordHash: 'hashed',
        isActive: true,
      });

      const result = await usersService.create(tenantId, tenantAdminActor, {
        name: 'New Manager',
        email: 'newmanager@acme.com',
        password: 'StrongP@ss1',
        role: Role.MANAGER,
      });

      expect((result as any).passwordHash).toBeUndefined();
      expect(invitationsService.enqueueInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'newmanager@acme.com' }),
      );
    });
  });

  describe('update', () => {
    it('blocks a Manager from modifying a Tenant Admin account', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'admin-1', tenantId, role: Role.TENANT_ADMIN });

      await expect(
        usersService.update(tenantId, 'admin-1', managerActor, { name: 'Renamed' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('blocks a user from changing their own role', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'admin-1', tenantId, role: Role.TENANT_ADMIN });

      await expect(
        usersService.update(tenantId, 'admin-1', tenantAdminActor, { role: Role.MANAGER }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('blocks a user from deleting their own account', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'admin-1', tenantId, role: Role.TENANT_ADMIN });

      await expect(usersService.remove(tenantId, 'admin-1', tenantAdminActor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('blocks a Manager from deleting a fellow Manager', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'manager-2', tenantId, role: Role.MANAGER });

      await expect(usersService.remove(tenantId, 'manager-2', managerActor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
