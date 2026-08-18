import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../interfaces/auth-user.interface';

/**
 * Every tenant-scoped read/write must call this instead of trusting any
 * tenantId supplied by the client (body/query/params). The tenant context
 * comes exclusively from the verified JWT payload attached by JwtStrategy.
 */
export function requireTenantId(user: AuthenticatedUser): string {
  if (!user.tenantId) {
    throw new ForbiddenException('This action requires an authenticated tenant context');
  }
  return user.tenantId;
}
