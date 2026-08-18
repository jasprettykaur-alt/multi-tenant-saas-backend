import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { buildPaginatedResult, getSkipTake } from '../common/utils/pagination.util';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { QueryTenantDto } from './dto/query-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(dto: CreateTenantDto, actorUserId: string, ip?: string) {
    const existing = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException('Tenant slug is already taken');
    }

    const tenant = await this.prisma.tenant.create({
      data: { name: dto.name, slug: dto.slug, plan: dto.plan },
    });

    await this.auditLogsService.record({
      tenantId: tenant.id,
      userId: actorUserId,
      action: AuditAction.TENANT_CREATED,
      resource: 'tenant',
      resourceId: tenant.id,
      ip,
    });

    return tenant;
  }

  async findAll(query: QueryTenantDto) {
    const { skip, take, page, limit } = getSkipTake(query);

    const where: Prisma.TenantWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.plan ? { plan: query.plan } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.tenant.findMany({
        where,
        skip,
        take,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return buildPaginatedResult(data, total, page, limit);
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto, actorUserId: string, ip?: string) {
    await this.findOne(id);

    const tenant = await this.prisma.tenant.update({ where: { id }, data: dto });

    await this.auditLogsService.record({
      tenantId: tenant.id,
      userId: actorUserId,
      action: AuditAction.TENANT_UPDATED,
      resource: 'tenant',
      resourceId: tenant.id,
      ip,
      metadata: dto as Record<string, unknown>,
    });

    return tenant;
  }

  async remove(id: string, actorUserId: string, ip?: string) {
    await this.findOne(id);

    await this.prisma.tenant.delete({ where: { id } });

    await this.auditLogsService.record({
      tenantId: id,
      userId: actorUserId,
      action: AuditAction.TENANT_DELETED,
      resource: 'tenant',
      resourceId: id,
      ip,
    });

    return { success: true };
  }
}
