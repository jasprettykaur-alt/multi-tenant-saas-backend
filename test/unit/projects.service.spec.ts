import { NotFoundException } from '@nestjs/common';
import { ProjectsService } from '../../src/projects/projects.service';
import { AuditLogsService } from '../../src/audit-logs/audit-logs.service';
import { CacheService } from '../../src/cache/cache.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthenticatedUser } from '../../src/common/interfaces/auth-user.interface';
import { Role } from '@prisma/client';

describe('ProjectsService', () => {
  let projectsService: ProjectsService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<Partial<AuditLogsService>>;
  let cacheService: jest.Mocked<Partial<CacheService>>;

  const tenantId = 'tenant-1';
  const actor: AuthenticatedUser = { userId: 'u1', email: 'a@a.com', role: Role.TENANT_ADMIN, tenantId };

  beforeEach(() => {
    prisma = {
      project: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      $transaction: jest.fn(),
    };
    auditLogsService = { record: jest.fn().mockResolvedValue(undefined) };
    cacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      delByPrefix: jest.fn().mockResolvedValue(undefined),
    };

    projectsService = new ProjectsService(
      prisma as unknown as PrismaService,
      auditLogsService as unknown as AuditLogsService,
      cacheService as unknown as CacheService,
    );
  });

  it('returns a cached project without hitting the database', async () => {
    const cachedProject = { id: 'p1', tenantId, name: 'Cached Project' };
    (cacheService.get as jest.Mock).mockResolvedValueOnce(cachedProject);

    const result = await projectsService.findOne(tenantId, 'p1');

    expect(result).toEqual(cachedProject);
    expect(prisma.project.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to the database on a cache miss and populates the cache', async () => {
    const dbProject = { id: 'p1', tenantId, name: 'DB Project' };
    prisma.project.findFirst.mockResolvedValue(dbProject);

    const result = await projectsService.findOne(tenantId, 'p1');

    expect(result).toEqual(dbProject);
    expect(cacheService.set).toHaveBeenCalledWith(expect.stringContaining(`tenant:${tenantId}:projects`), dbProject, expect.any(Number));
  });

  it('throws NotFoundException for a project outside the tenant', async () => {
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(projectsService.findOne(tenantId, 'other-tenant-project')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('invalidates the tenant cache prefix after creating a project', async () => {
    prisma.project.create.mockResolvedValue({ id: 'p2', tenantId, name: 'New Project' });

    await projectsService.create(tenantId, actor, { name: 'New Project' });

    expect(cacheService.delByPrefix).toHaveBeenCalledWith(`tenant:${tenantId}:projects`);
  });
});
