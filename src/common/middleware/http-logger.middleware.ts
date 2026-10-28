import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('HTTP');

/**
 * Loga cada requisição: método, rota, status, duração e IP.
 * Usa o evento "finish", então também registra respostas de guards (401/403).
 */
export function httpLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    const { statusCode } = res;
    const duration = Date.now() - start;
    const hasAuth = req.headers.authorization ? 'com token' : 'sem token';
    const message = `${method} ${originalUrl} -> ${statusCode} (${duration}ms) [${hasAuth}] ip=${req.ip}`;

    if (statusCode >= 500) logger.error(message);
    else if (statusCode >= 400) logger.warn(message);
    else logger.log(message);
  });

  next();
}
