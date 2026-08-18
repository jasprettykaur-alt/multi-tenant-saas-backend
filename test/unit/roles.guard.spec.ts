import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../../src/common/guards/roles.guard';

function buildContext(user: { role: Role } | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows the request when the route has no @Roles metadata', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(buildContext({ role: Role.EMPLOYEE }))).toBe(true);
  });

  it('allows the request when the user role is included', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.TENANT_ADMIN, Role.MANAGER]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(buildContext({ role: Role.MANAGER }))).toBe(true);
  });

  it('throws ForbiddenException when the user role is not included', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.TENANT_ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(buildContext({ role: Role.EMPLOYEE }))).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when there is no authenticated user', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.TENANT_ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(buildContext(undefined))).toThrow(ForbiddenException);
  });
});
