import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/auth-user.interface';
import { requireTenantId } from '../common/utils/tenant.util';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectDto } from './dto/query-project.dto';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Create a project within the current tenant' })
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    const tenantId = requireTenantId(user);
    return this.projectsService.create(tenantId, user, dto, req.ip);
  }

  @Get()
  @ApiOperation({ summary: 'List projects within the current tenant' })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryProjectDto) {
    const tenantId = requireTenantId(user);
    return this.projectsService.findAll(tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a project within the current tenant by id' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    return this.projectsService.findOne(tenantId, id);
  }

  @Patch(':id')
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Update a project within the current tenant' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const tenantId = requireTenantId(user);
    return this.projectsService.update(tenantId, id, user, dto, req.ip);
  }

  @Delete(':id')
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Delete a project within the current tenant' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    const tenantId = requireTenantId(user);
    return this.projectsService.remove(tenantId, id, user, req.ip);
  }
}
