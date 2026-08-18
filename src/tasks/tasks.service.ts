import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma, Role, Task } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuthenticatedUser } from '../common/interfaces/auth-user.interface';
import { buildPaginatedResult, getSkipTake } from '../common/utils/pagination.util';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTaskDto } from './dto/query-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(tenantId: string, actor: AuthenticatedUser, dto: CreateTaskDto, ip?: string) {
    await this.assertProjectInTenant(tenantId, dto.projectId);
    if (dto.assignedTo) {
      await this.assertUserInTenant(tenantId, dto.assignedTo);
    }

    const task = await this.prisma.task.create({
      data: {
        tenantId,
        projectId: dto.projectId,
        title: dto.title,
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        assignedTo: dto.assignedTo,
      },
    });

    await this.auditLogsService.record({
      tenantId,
      userId: actor.userId,
      action: AuditAction.TASK_CREATED,
      resource: 'task',
      resourceId: task.id,
      ip,
    });

    return task;
  }

  async findAll(tenantId: string, actor: AuthenticatedUser, query: QueryTaskDto) {
    const { skip, take, page, limit } = getSkipTake(query);

    const where: Prisma.TaskWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.assignedTo ? { assignedTo: query.assignedTo } : {}),
      // Employees only ever see work assigned to them, regardless of filters requested.
      ...(actor.role === Role.EMPLOYEE ? { assignedTo: actor.userId } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        skip,
        take,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
      }),
      this.prisma.task.count({ where }),
    ]);

    return buildPaginatedResult(data, total, page, limit);
  }

  async findOne(tenantId: string, actor: AuthenticatedUser, id: string) {
    const task = await this.prisma.task.findFirst({ where: { id, tenantId } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    if (actor.role === Role.EMPLOYEE && task.assignedTo !== actor.userId) {
      throw new ForbiddenException('You may only access tasks assigned to you');
    }
    return task;
  }

  async update(
    tenantId: string,
    id: string,
    actor: AuthenticatedUser,
    dto: UpdateTaskDto,
    ip?: string,
  ) {
    const existing = await this.prisma.task.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const data = this.assertUpdatePermissions(actor, existing, dto);

    if (data.projectId) {
      await this.assertProjectInTenant(tenantId, data.projectId);
    }
    if (data.assignedTo) {
      await this.assertUserInTenant(tenantId, data.assignedTo);
    }

    const task = await this.prisma.task.update({ where: { id }, data });

    await this.auditLogsService.record({
      tenantId,
      userId: actor.userId,
      action: AuditAction.TASK_UPDATED,
      resource: 'task',
      resourceId: task.id,
      ip,
      metadata: data as Record<string, unknown>,
    });

    return task;
  }

  async remove(tenantId: string, id: string, actor: AuthenticatedUser, ip?: string) {
    const existing = await this.prisma.task.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    await this.prisma.task.delete({ where: { id } });

    await this.auditLogsService.record({
      tenantId,
      userId: actor.userId,
      action: AuditAction.TASK_DELETED,
      resource: 'task',
      resourceId: id,
      ip,
    });

    return { success: true };
  }

  /** Employees may only flip the status of tasks assigned to them; nothing else. */
  private assertUpdatePermissions(actor: AuthenticatedUser, existing: Task, dto: UpdateTaskDto): UpdateTaskDto {
    if (actor.role !== Role.EMPLOYEE) {
      return dto;
    }

    if (existing.assignedTo !== actor.userId) {
      throw new ForbiddenException('You may only update tasks assigned to you');
    }

    const { status } = dto;
    const disallowed = Object.keys(dto).filter((key) => key !== 'status');
    if (disallowed.length > 0) {
      throw new ForbiddenException('Employees may only update the status of their assigned tasks');
    }

    return { status };
  }

  private async assertProjectInTenant(tenantId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, tenantId } });
    if (!project) {
      throw new BadRequestException('projectId does not belong to your tenant');
    }
  }

  private async assertUserInTenant(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) {
      throw new BadRequestException('assignedTo does not belong to your tenant');
    }
  }
}
