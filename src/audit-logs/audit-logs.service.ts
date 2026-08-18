import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { buildPaginatedResult, getSkipTake } from '../common/utils/pagination.util';

export interface RecordAuditEventInput {
  tenantId: string | null;
  userId: string | null;
  action: AuditAction;
  resource: string;
  resourceId?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget style logging: audit failures must never break the request. */
  async record(input: RecordAuditEventInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          action: input.action,
          resource: input.resource,
          resourceId: input.resourceId ?? null,
          ip: input.ip ?? null,
          metadata: input.metadata as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Auditing is best-effort; swallow to avoid failing the primary operation.
    }
  }

  async findAllForTenant(tenantId: string, query: PaginationQueryDto & { action?: AuditAction }) {
    const { skip, take, page, limit } = getSkipTake(query);

    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.search
        ? {
            OR: [
              { resource: { contains: query.search, mode: 'insensitive' } },
              { resourceId: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return buildPaginatedResult(data, total, page, limit);
  }
}
