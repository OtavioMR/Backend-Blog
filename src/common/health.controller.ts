import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiPublicRoute } from '../docs/decorators/public.decorator.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService, private readonly database: TypeOrmHealthIndicator) {}
  @Get()
  @ApiPublicRoute()
  @ApiOperation({ summary: 'Verificar saúde da API e do banco de dados' })
  @ApiResponse({ status: 200, description: 'API e banco disponíveis.', schema: { example: { status: 'ok', info: { database: { responseTime: 2, status: 'up' } }, error: {}, details: { database: { responseTime: 2, status: 'up' } } } } })
  @ApiResponse({ status: 503, description: 'Banco indisponível.' })
  @HealthCheck()
  check() { return this.health.check([() => this.database.pingCheck('database')]); }
}
