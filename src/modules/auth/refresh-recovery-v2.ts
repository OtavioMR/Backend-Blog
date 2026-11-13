import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions } from 'express';

export const REFRESH_PROTOCOL_V2 = 2;
export const RECOVERY_WINDOW_SECONDS = 120;
export const MAX_OPERATIONS_PER_SESSION = 64;
export const MAX_COOKIE_HEADER_BYTES = 8192;
export const MAX_SESSION_COOKIES_IN_JAR = 16;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPERATION_ID_REGEX = /^[A-Za-z0-9_-]{43}$/;
const PROOF_VALUE_REGEX = /^[A-Za-z0-9_-]{43}$/;

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqualHex(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== 64 || b.length !== 64 || !/^[0-9a-f]{64}$/i.test(a) || !/^[0-9a-f]{64}$/i.test(b)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export function generateSessionProof(): { proof: string; proofHash: string } {
  const proof = randomBytes(32).toString('base64url');
  return { proof, proofHash: sha256Hex(proof) };
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

export function isValidOperationId(value: unknown): value is string {
  return typeof value === 'string' && OPERATION_ID_REGEX.test(value);
}

export function isValidProofValue(value: unknown): value is string {
  return typeof value === 'string' && PROOF_VALUE_REGEX.test(value);
}

export function isValidGenerationHeader(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,14})$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function v2CookiePrefix(isProduction: boolean): string {
  return isProduction ? '__Secure-griforio' : 'griforio-dev';
}

export function v2RefreshCookieName(sessionId: string, generation: number, isProduction: boolean): string {
  return `${v2CookiePrefix(isProduction)}-rt-${sessionId.toLowerCase()}-${generation}`;
}

export function v2ProofCookieName(sessionId: string, generation: number, isProduction: boolean): string {
  return `${v2CookiePrefix(isProduction)}-proof-${sessionId.toLowerCase()}-${generation}`;
}

export function getV2CookieOptions(isProduction: boolean, maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: Math.max(0, Math.floor(maxAgeMs)),
  };
}

export interface ParsedV2SessionCookies {
  refreshByGeneration: Map<number, string>;
  proofByGeneration: Map<number, string>;
  observedGenerations: number[];
  duplicateDetected: boolean;
  headerTooLarge: boolean;
  tooManySessionCookies: boolean;
}

export function parseRawV2Cookies(
  rawCookieHeader: string | undefined,
  sessionId: string,
  isProduction: boolean,
): ParsedV2SessionCookies {
  const refreshByGeneration = new Map<number, string>();
  const proofByGeneration = new Map<number, string>();
  const seenNames = new Set<string>();
  const generations = new Set<number>();

  if (!rawCookieHeader) {
    return {
      refreshByGeneration,
      proofByGeneration,
      observedGenerations: [],
      duplicateDetected: false,
      headerTooLarge: false,
      tooManySessionCookies: false,
    };
  }

  if (Buffer.byteLength(rawCookieHeader, 'utf8') > MAX_COOKIE_HEADER_BYTES) {
    return {
      refreshByGeneration,
      proofByGeneration,
      observedGenerations: [],
      duplicateDetected: false,
      headerTooLarge: true,
      tooManySessionCookies: false,
    };
  }

  const normalizedSid = sessionId.toLowerCase();
  const prefix = v2CookiePrefix(isProduction);
  const rtPrefix = `${prefix}-rt-${normalizedSid}-`;
  const proofPrefix = `${prefix}-proof-${normalizedSid}-`;

  let sessionCookieCount = 0;
  let duplicateDetected = false;

  const pairs = rawCookieHeader.split(';');
  for (const rawPair of pairs) {
    const trimmed = rawPair.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const name = trimmed.slice(0, eqIdx).trim();
    const rawVal = trimmed.slice(eqIdx + 1).trim();

    if (!name.startsWith(rtPrefix) && !name.startsWith(proofPrefix)) {
      continue;
    }

    sessionCookieCount++;
    if (seenNames.has(name)) {
      duplicateDetected = true;
      break;
    }
    seenNames.add(name);

    const isRt = name.startsWith(rtPrefix);
    const genStr = name.slice(isRt ? rtPrefix.length : proofPrefix.length);
    if (!/^(?:0|[1-9]\d{0,14})$/.test(genStr)) {
      duplicateDetected = true;
      break;
    }
    const gen = Number(genStr);
    let decoded = rawVal;
    try {
      decoded = decodeURIComponent(rawVal);
    } catch {
      duplicateDetected = true;
      break;
    }
    generations.add(gen);
    if (isRt) {
      refreshByGeneration.set(gen, decoded);
    } else {
      proofByGeneration.set(gen, decoded);
    }
  }

  return {
    refreshByGeneration,
    proofByGeneration,
    observedGenerations: [...generations].sort((a, b) => a - b),
    duplicateDetected,
    headerTooLarge: false,
    tooManySessionCookies: sessionCookieCount > MAX_SESSION_COOKIES_IN_JAR,
  };
}

export interface EncryptedRecoveryPayload {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  sessionId: string;
  inputGeneration: number;
  outputGeneration: number;
  authVersion: number;
  accessExpiresAtMs: number;
  refreshExpiresAtMs: number;
  resultExpiresAtMs: number;
}

export interface CipherEnvelope {
  ciphertext: string;
  keyId: string;
  nonce: string;
  tag: string;
}

function deriveKey(rawSecret: string, keyId: string): Buffer {
  if (/^[a-f0-9]{64}$/i.test(rawSecret)) {
    return Buffer.from(rawSecret, 'hex');
  }
  return createHmac('sha256', rawSecret).update(`griforio-refresh-v2-key:${keyId}`).digest();
}

export function resolveRecoveryKeys(
  explicitKey: string | undefined,
  fallbackSecret: string | undefined,
  previousExplicitKey?: string,
): { currentKeyId: string; keys: Map<string, Buffer> } | null {
  const keys = new Map<string, Buffer>();
  const primary = explicitKey?.trim() || fallbackSecret?.trim();
  if (!primary || primary.length < 16) return null;
  const legacyId = explicitKey?.trim() ? 'v2-explicit-1' : 'v2-derived-1';
  const currentKey = deriveKey(primary, legacyId);
  // Identify the actual key, not its slot: after rotation the old ciphertext
  // must still resolve to the previous key rather than the new primary key.
  const keyId = (key: Buffer) => `v2-${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
  const currentKeyId = keyId(currentKey);
  keys.set(currentKeyId, currentKey);
  keys.set(legacyId, currentKey);
  if (fallbackSecret?.trim() && explicitKey?.trim()) {
    keys.set('v2-derived-1', deriveKey(fallbackSecret.trim(), 'v2-derived-1'));
  }
  if (previousExplicitKey?.trim() && previousExplicitKey.trim().length >= 16) {
    const previous = deriveKey(previousExplicitKey.trim(), legacyId);
    keys.set(keyId(previous), previous);
    keys.set(legacyId, previous);
  }
  return { currentKeyId, keys };
}

function buildAad(params: {
  sessionId: string;
  operationHash: string;
  inputGeneration: number;
  outputGeneration: number;
  authVersion: number;
}): Buffer {
  return Buffer.from(
    `v2|${params.sessionId.toLowerCase()}|${params.operationHash}|${params.inputGeneration}|${params.outputGeneration}|${params.authVersion}`,
    'utf8',
  );
}

export function encryptRecoveryResult(
  payload: EncryptedRecoveryPayload,
  operationHash: string,
  keyRing: { currentKeyId: string; keys: Map<string, Buffer> },
): CipherEnvelope {
  const key = keyRing.keys.get(keyRing.currentKeyId);
  if (!key) throw new Error('Recovery encryption key unavailable');
  const iv = randomBytes(12);
  const aad = buildAad({
    sessionId: payload.sessionId,
    operationHash,
    inputGeneration: payload.inputGeneration,
    outputGeneration: payload.outputGeneration,
    authVersion: payload.authVersion,
  });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64url'),
    keyId: keyRing.currentKeyId,
    nonce: iv.toString('base64url'),
    tag: tag.toString('base64url'),
  };
}

export function decryptRecoveryResult(
  envelope: CipherEnvelope,
  aadParams: {
    sessionId: string;
    operationHash: string;
    inputGeneration: number;
    outputGeneration: number;
    authVersion: number;
  },
  keyRing: { currentKeyId: string; keys: Map<string, Buffer> },
): EncryptedRecoveryPayload {
  const key = keyRing.keys.get(envelope.keyId);
  if (!key) throw new Error('Unknown recovery encryption key_id');
  const iv = Buffer.from(envelope.nonce, 'base64url');
  const tag = Buffer.from(envelope.tag, 'base64url');
  const encrypted = Buffer.from(envelope.ciphertext, 'base64url');
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid recovery cipher parameters');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(buildAad(aadParams));
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  const parsed = JSON.parse(decrypted) as EncryptedRecoveryPayload;
  if (
    !parsed ||
    typeof parsed.accessToken !== 'string' ||
    typeof parsed.refreshToken !== 'string' ||
    parsed.sessionId.toLowerCase() !== aadParams.sessionId.toLowerCase() ||
    parsed.inputGeneration !== aadParams.inputGeneration ||
    parsed.outputGeneration !== aadParams.outputGeneration ||
    parsed.authVersion !== aadParams.authVersion
  ) {
    throw new Error('Recovery payload integrity mismatch');
  }
  return parsed;
}

export function validateOriginAndFetchMetadata(
  originHeader: string | undefined,
  secFetchSite: string | undefined,
  secFetchMode: string | undefined,
  contentTypeHeader: string | undefined,
  allowedOrigins: string[],
): { ok: true } | { ok: false; status: 400 | 403; code: string; message: string } {
  if (contentTypeHeader && /^(?:application\/x-www-form-urlencoded|multipart\/form-data|text\/plain)(?:;|$)/i.test(contentTypeHeader.trim())) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_REFRESH_REQUEST',
      message: 'Formato de requisição inválido para renovação v2.',
    };
  }
  if (!originHeader) {
    return {
      ok: false,
      status: 403,
      code: 'ORIGIN_REQUIRED',
      message: 'Origem da requisição não permitida.',
    };
  }
  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(originHeader).origin;
  } catch {
    return {
      ok: false,
      status: 403,
      code: 'ORIGIN_INVALID',
      message: 'Origem da requisição inválida.',
    };
  }
  if (originHeader !== normalizedOrigin || !allowedOrigins.includes(normalizedOrigin)) {
    return {
      ok: false,
      status: 403,
      code: 'ORIGIN_FORBIDDEN',
      message: 'Origem da requisição não autorizada.',
    };
  }
  if (secFetchSite && !['same-origin', 'same-site', 'none'].includes(secFetchSite.toLowerCase())) {
    return {
      ok: false,
      status: 403,
      code: 'FETCH_SITE_FORBIDDEN',
      message: 'Contexto de requisição cross-site bloqueado.',
    };
  }
  if (secFetchMode && secFetchMode.toLowerCase() === 'navigate') {
    return {
      ok: false,
      status: 403,
      code: 'FETCH_MODE_FORBIDDEN',
      message: 'Modo de navegação não permitido.',
    };
  }
  return { ok: true };
}
