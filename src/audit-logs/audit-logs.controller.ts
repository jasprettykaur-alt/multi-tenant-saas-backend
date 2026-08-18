import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/auth-user.interface';
import { requireTenantId } from '../common/utils/tenant.util';
import { AuditLogsService } from './audit-logs.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'List audit log events for the current tenant' })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryAuditLogDto) {
    const tenantId = requireTenantId(user);
    return this.auditLogsService.findAllForTenant(tenantId, query);
  }
}
