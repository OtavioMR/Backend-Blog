import { applyDecorators } from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';

/**
 * Marca explicitamente um endpoint OpenAPI como público,
 * sobrescrevendo a exigência global de Bearer Auth (JWT).
 */
export function ApiPublicRoute() {
  return applyDecorators(ApiSecurity({}));
}
