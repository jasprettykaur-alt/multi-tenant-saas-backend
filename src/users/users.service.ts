import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma, Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { InvitationsService } from '../jobs/invitations.service';
import { AuthenticatedUser } from '../common/interfaces/auth-user.interface';
import { buildPaginatedResult, getSkipTake } from '../common/utils/pagination.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';

const SALT_ROUNDS = 12;

function sanitize(user: User) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly invitationsService: InvitationsService,
  ) {}

  async create(tenantId: string, actor: AuthenticatedUser, dto: CreateUserDto, ip?: string) {
    if (actor.role === Role.MANAGER && dto.role === Role.TENANT_ADMIN) {
      throw new ForbiddenException('Managers cannot create Tenant Admins');
    }

    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists in this tenant');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email.toLowerCase(),
        name: dto.name,
        role: dto.role,
        passwordHash,
      },
    });

    await this.auditLogsService.record({
      tenantId,
      userId: actor.userId,
      action: AuditAction.USER_CREATED,
      resource: 'user',
      resourceId: user.id,
      ip,
      metadata: { role: user.role },
    });

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    await this.invitationsService.enqueueInvitation({
      email: user.email,
      name: user.name,
      tenantName: tenant?.name ?? 'your organisation',
    });

    return sanitize(user);
  }

  async findAll(tenantId: string, query: QueryUserDto) {
    const { skip, take, page, limit } = getSkipTake(query);

    const where: Prisma.UserWhereInput = {
      tenantId,
      ...(query.role ? { role: query.role } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return buildPaginatedResult(data.map(sanitize), total, page, limit);
  }

  async findOne(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return sanitize(user);
  }

  async update(
    tenantId: string,
    id: string,
    actor: AuthenticatedUser,
    dto: UpdateUserDto,
    ip?: string,
  ) {
    const target = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!target) {
      throw new NotFoundException('User not found');
    }

    this.assertCanManage(actor, target);

    if (dto.role && dto.role !== target.role) {
      if (actor.role === Role.MANAGER && (dto.role === Role.TENANT_ADMIN || target.role === Role.TENANT_ADMIN)) {
        throw new ForbiddenException('Managers cannot assign or modify the Tenant Admin role');
      }
      if (actor.userId === target.id) {
        throw new BadRequestException('You cannot change your own role');
      }
    }

    const user = await this.prisma.user.update({ where: { id }, data: dto });

    await this.auditLogsService.record({
      tenantId,
      userId: actor.userId,
      action: dto.role ? AuditAction.ROLE_CHANGED : AuditAction.USER_UPDATED,
      resource: 'user',
      resourceId: user.id,
      ip,
      metadata: dto as Record<string, unknown>,
    });

    return sanitize(user);
  }

  async remove(tenantId: string, id: string, actor: AuthenticatedUser, ip?: string) {
    const target = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!target) {
      throw new NotFoundException('User not found');
    }

    if (actor.userId === target.id) {
      throw new BadRequestException('You cannot delete your own account');
    }

    this.assertCanManage(actor, target);

    await this.prisma.user.delete({ where: { id } });

    await this.auditLogsService.record({
      tenantId,
      userId: actor.userId,
      action: AuditAction.USER_DELETED,
      resource: 'user',
      resourceId: id,
      ip,
    });

    return { success: true };
  }

  /** Managers may only manage Employees; Tenant Admins may manage anyone in their tenant. */
  private assertCanManage(actor: AuthenticatedUser, target: User) {
    if (actor.role === Role.MANAGER && target.role !== Role.EMPLOYEE) {
      throw new ForbiddenException('Managers can only manage Employee accounts');
    }
  }
}
