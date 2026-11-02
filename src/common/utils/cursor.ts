import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';

export type CursorPosition = { timestamp: string; id: string };

/** Keep PostgreSQL's microsecond precision; JavaScript Date only retains milliseconds. */
export function encodeCursor(position: CursorPosition): string {
  return Buffer.from(JSON.stringify(position)).toString('base64url');
}

export function decodeCursor(value: string): CursorPosition {
  try {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) throw new Error();
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!decoded || typeof decoded !== 'object') throw new Error();
    const { timestamp, id } = decoded as Record<string, unknown>;
    if (typeof timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(timestamp) ||
        !Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== `${timestamp.slice(0, 23)}Z` ||
        typeof id !== 'string' || !isUUID(id)) throw new Error();
    return { timestamp, id };
  } catch {
    throw new BadRequestException('Cursor inválido.');
  }
}
