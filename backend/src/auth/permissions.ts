import { CanActivate, ExecutionContext, ForbiddenException, SetMetadata, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePerm = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);

const ROLE_PERMISSIONS: Record<Role, Set<string>> = {
  ADMIN: new Set(['*']),
  MANAGER: new Set([
    'transfer.create',
    'transfer.reverse',
    'transfer.finalize',
    'products.manage',
    'transfer.view',
    'transfer.acknowledge',
    'audit.manage',
    'par.view',
    'par.manage',
    'receiving.manage',
    'analytics.view',
    'ordering.view',
    'ordering.manage',
    'suppliers.manage',
  ]),
  WAREHOUSE: new Set([
    'transfer.create',
    'transfer.reverse',
    'transfer.finalize',
    'transfer.view',
    'transfer.acknowledge',
    'par.view',
    'receiving.manage',
  ]),
  TECH: new Set(['transfer.create', 'transfer.reverse', 'transfer.acknowledge', 'transfer.view']),
};

function hasPermission(role: Role, perm: string): boolean {
  if (ROLE_PERMISSIONS[role]?.has('*')) return true;
  return ROLE_PERMISSIONS[role]?.has(perm) ?? false;
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const perms = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!perms || perms.length === 0) return true;
    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: Role };

    const role = user?.role;
    if (!role) {
      throw new ForbiddenException('Missing role for permission check');
    }

    const missing = perms.filter((perm) => !hasPermission(role, perm));
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing permissions: ${missing.join(', ')} for role ${role}`);
    }
    return true;
  }
}
