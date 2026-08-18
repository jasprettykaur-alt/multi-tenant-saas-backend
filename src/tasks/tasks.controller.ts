import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/auth-user.interface';
import { requireTenantId } from '../common/utils/tenant.util';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTaskDto } from './dto/query-task.dto';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Create a task within the current tenant' })
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    const tenantId = requireTenantId(user);
    return this.tasksService.create(tenantId, user, dto, req.ip);
  }

  @Get()
  @ApiOperation({ summary: 'List tasks within the current tenant (Employees see only their own)' })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryTaskDto) {
    const tenantId = requireTenantId(user);
    return this.tasksService.findAll(tenantId, user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a task within the current tenant by id' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    return this.tasksService.findOne(tenantId, user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task (Employees may only change status on their own tasks)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const tenantId = requireTenantId(user);
    return this.tasksService.update(tenantId, id, user, dto, req.ip);
  }

  @Delete(':id')
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Delete a task within the current tenant' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    const tenantId = requireTenantId(user);
    return this.tasksService.remove(tenantId, id, user, req.ip);
  }
}
