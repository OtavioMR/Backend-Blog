import { Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { UserRole } from '../users/enums/user.enum.js';
import { ModerationService } from './moderation.service.js';
class SuspendDto {
  @ApiProperty({ minLength: 5, maxLength: 1000, example: 'Repeated abuse' }) @IsString() @MinLength(5) @MaxLength(1000) reason: string;
  @ApiPropertyOptional({ nullable: true, format: 'date-time', example: '2099-01-01T00:00:00Z', description: 'Omit or use null for a permanent ban.' }) @IsOptional() @IsISO8601({ strict: true }) endsAt?: string | null;
  @ApiPropertyOptional({ type: [String], format: 'uuid', example: [], description: 'Published posts to hide permanently.' }) @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('4', { each: true }) hidePostIds?: string[];
}
@ApiTags('Moderation') @ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
@Controller('admin/users')
export class ModerationController {
  constructor(private readonly service: ModerationService) {}
  @Post(':id/suspension')
  @ApiOperation({ summary: 'Suspend or ban a user', description: 'Administrators only. Revokes sessions and hides selected published posts; omission of endsAt creates a permanent ban.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @ApiResponse({ status: 201, description: 'Suspension applied.', schema: { example: { suspended: true, endsAt: null } } })
  @ApiResponse({ status: 400, description: 'Invalid reason, expiration or post IDs.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Administrator required or attempt to suspend self.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 409, description: 'User already inactive.' })
  suspend(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser, @Body() dto: SuspendDto) { return this.service.suspend(req.user.userId, id, dto.reason, dto.endsAt ?? null, dto.hidePostIds ?? []); }
  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore a suspended user', description: 'Administrators only. Previously hidden posts stay hidden.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @ApiResponse({ status: 201, description: 'User restored.', schema: { example: { suspended: false } } })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Administrator required.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 409, description: 'User is not suspended.' })
  restore(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) { return this.service.restore(req.user.userId, id); }
}
