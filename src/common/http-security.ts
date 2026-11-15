import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { isIP } from 'node:net';

export function configureHttpSecurity(
  app: NestExpressApplication,
  frontendUrl: string,
  trustedProxyCidrs = process.env.TRUST_PROXY_CIDRS ?? '',
): void {
  app.use(helmet());
  app.enableCors({ origin: [new URL(frontendUrl).origin], credentials: true });
  const proxies = trustedProxyCidrs.split(',').map(value => value.trim()).filter(Boolean);
  for (const proxy of proxies) {
    const [address, bits, extra] = proxy.split('/');
    const family = isIP(address);
    if (!family || extra || (bits !== undefined && (!/^\d+$/.test(bits) || Number(bits) < 1 || Number(bits) > (family === 4 ? 32 : 128)))) {
      throw new Error('TRUST_PROXY_CIDRS must contain explicit IP addresses or CIDRs');
    }
  }
  app.set('trust proxy', proxies.length ? proxies : false);
}
