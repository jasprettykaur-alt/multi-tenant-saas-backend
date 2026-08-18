import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/auth-user.interface';
import { requireTenantId } from '../common/utils/tenant.util';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the current authenticated user profile' })
  getMe(@CurrentUser() user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    return this.usersService.findOne(tenantId, user.userId);
  }

  @Post()
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Create a user within the current tenant' })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    const tenantId = requireTenantId(user);
    return this.usersService.create(tenantId, user, dto, req.ip);
  }

  @Get()
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'List users within the current tenant' })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryUserDto) {
    const tenantId = requireTenantId(user);
    return this.usersService.findAll(tenantId, query);
  }

  @Get(':id')
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Get a user within the current tenant by id' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    return this.usersService.findOne(tenantId, id);
  }

  @Patch(':id')
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Update a user within the current tenant' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const tenantId = requireTenantId(user);
    return this.usersService.update(tenantId, id, user, dto, req.ip);
  }

  @Delete(':id')
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Delete a user within the current tenant' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    const tenantId = requireTenantId(user);
    return this.usersService.remove(tenantId, id, user, req.ip);
  }
}
