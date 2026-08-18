import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CacheService } from '../cache/cache.service';
import { AuthenticatedUser } from '../common/interfaces/auth-user.interface';
import { buildPaginatedResult, getSkipTake } from '../common/utils/pagination.util';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectDto } from './dto/query-project.dto';

const CACHE_TTL_SECONDS = 60;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly cacheService: CacheService,
  ) {}

  async create(tenantId: string, actor: AuthenticatedUser, dto: CreateProjectDto, ip?: string) {
    const project = await this.prisma.project.create({
      data: { tenantId, name: dto.name, description: dto.description },
    });

    await this.invalidateTenantCache(tenantId);

    await this.auditLogsService.record({
      tenantId,
      userId: actor.userId,
      action: AuditAction.PROJECT_CREATED,
      resource: 'project',
      resourceId: project.id,
      ip,
    });

    return project;
  }

  async findAll(tenantId: string, query: QueryProjectDto) {
    const { skip, take, page, limit } = getSkipTake(query);
    const cacheKey = CacheService.tenantKey(tenantId, 'projects', 'list', this.hashQuery(query));

    const cached = await this.cacheService.get<ReturnType<typeof buildPaginatedResult>>(cacheKey);
    if (cached) {
      return cached;
    }

    const where: Prisma.ProjectWhereInput = {
      tenantId,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        skip,
        take,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
      }),
      this.prisma.project.count({ where }),
    ]);

    const result = buildPaginatedResult(data, total, page, limit);
    await this.cacheService.set(cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  }

  async findOne(tenantId: string, id: string) {
    const cacheKey = CacheService.tenantKey(tenantId, 'projects', 'item', id);
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const project = await this.prisma.project.findFirst({ where: { id, tenantId } });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.cacheService.set(cacheKey, project, CACHE_TTL_SECONDS);
    return project;
  }

  async update(
    tenantId: string,
    id: string,
    actor: AuthenticatedUser,
    dto: UpdateProjectDto,
    ip?: string,
  ) {
    const existing = await this.prisma.project.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    const project = await this.prisma.project.update({ where: { id }, data: dto });
    await this.invalidateTenantCache(tenantId);

    await this.auditLogsService.record({
      tenantId,
      userId: actor.userId,
      action: AuditAction.PROJECT_UPDATED,
      resource: 'project',
      resourceId: project.id,
      ip,
      metadata: dto as Record<string, unknown>,
    });

    return project;
  }

  async remove(tenantId: string, id: string, actor: AuthenticatedUser, ip?: string) {
    const existing = await this.prisma.project.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    await this.prisma.project.delete({ where: { id } });
    await this.invalidateTenantCache(tenantId);

    await this.auditLogsService.record({
      tenantId,
      userId: actor.userId,
      action: AuditAction.PROJECT_DELETED,
      resource: 'project',
      resourceId: id,
      ip,
    });

    return { success: true };
  }

  private async invalidateTenantCache(tenantId: string) {
    await this.cacheService.delByPrefix(CacheService.tenantKey(tenantId, 'projects'));
  }

  private hashQuery(query: unknown): string {
    return createHash('md5').update(JSON.stringify(query)).digest('hex');
  }
}
