import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/auth-user.interface';
import { requireTenantId } from '../common/utils/tenant.util';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { QueryTenantDto } from './dto/query-tenant.dto';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('me')
  @ApiOperation({ summary: "Get the current user's own tenant" })
  getOwnTenant(@CurrentUser() user: AuthenticatedUser) {
    return this.tenantsService.findOne(requireTenantId(user));
  }

  @Post()
  @Roles(Role.PLATFORM_ADMIN)
  @ApiOperation({ summary: '[Platform Admin] Provision a new tenant organisation' })
  create(@Body() dto: CreateTenantDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.tenantsService.create(dto, user.userId, req.ip);
  }

  @Get()
  @Roles(Role.PLATFORM_ADMIN)
  @ApiOperation({ summary: '[Platform Admin] List all tenants on the platform' })
  findAll(@Query() query: QueryTenantDto) {
    return this.tenantsService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.PLATFORM_ADMIN)
  @ApiOperation({ summary: '[Platform Admin] Get a tenant by id' })
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.PLATFORM_ADMIN)
  @ApiOperation({ summary: '[Platform Admin] Update a tenant (plan/status/name)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.tenantsService.update(id, dto, user.userId, req.ip);
  }

  @Delete(':id')
  @Roles(Role.PLATFORM_ADMIN)
  @ApiOperation({ summary: '[Platform Admin] Permanently delete a tenant and its data' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.tenantsService.remove(id, user.userId, req.ip);
  }
}
