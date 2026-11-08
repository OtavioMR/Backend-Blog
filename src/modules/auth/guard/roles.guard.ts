import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator.js';
import { isAdministrator, UserRole } from '../../users/enums/user.enum.js';
import type { RequestWithUser } from '../interfaces/request-with-user.interface.js';
import { roleSatisfies } from '../../../common/permissions/capabilities.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<RequestWithUser>();

    if (!user || !user.role) {
      throw new ForbiddenException(
        'Acesso negado: usuário não autenticado ou sem perfil definido.',
      );
    }

    const hasRole = requiredRoles.some((requiredRole) => roleSatisfies(user.role, requiredRole));

    if (!hasRole) {
      throw new ForbiddenException(
        'Você não possui a permissão necessária para acessar este recurso.',
      );
    }

    if (requiredRoles.some(role => isAdministrator(role)) && isAdministrator(user.role) && user.totpEnabled !== true) {
      throw new ForbiddenException('Ative a autenticação de dois fatores antes de acessar a administração.');
    }

    return true;
  }
}
