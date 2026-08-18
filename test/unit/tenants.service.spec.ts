import { ConflictException, NotFoundException } from '@nestjs/common';
import { TenantsService } from '../../src/tenants/tenants.service';
import { AuditLogsService } from '../../src/audit-logs/audit-logs.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('TenantsService', () => {
  let tenantsService: TenantsService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<Partial<AuditLogsService>>;

  beforeEach(() => {
    prisma = {
      tenant: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      $transaction: jest.fn(),
    };
    auditLogsService = { record: jest.fn().mockResolvedValue(undefined) };

    tenantsService = new TenantsService(
      prisma as unknown as PrismaService,
      auditLogsService as unknown as AuditLogsService,
    );
  });

  it('rejects creating a tenant with a duplicate slug', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', slug: 'acme-corp' });

    await expect(
      tenantsService.create({ name: 'Acme Corp', slug: 'acme-corp' }, 'actor-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.tenant.create).not.toHaveBeenCalled();
  });

  it('creates a tenant when the slug is free', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    prisma.tenant.create.mockResolvedValue({ id: 'tenant-1', name: 'Acme Corp', slug: 'acme-corp' });

    const result = await tenantsService.create({ name: 'Acme Corp', slug: 'acme-corp' }, 'actor-1');

    expect(result.id).toBe('tenant-1');
    expect(auditLogsService.record).toHaveBeenCalled();
  });

  it('throws NotFoundException for a tenant that does not exist', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(tenantsService.findOne('missing-id')).rejects.toBeInstanceOf(NotFoundException);
  });
});
