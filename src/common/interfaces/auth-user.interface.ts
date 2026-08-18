import { Role } from '@prisma/client';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
  tenantId: string | null;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  tenantId: string | null;
}
