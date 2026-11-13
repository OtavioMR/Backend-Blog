import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, type Repository } from 'typeorm';
import configured from '../../database/data-source.js';
import { AuthService } from './auth.service.js';
import { AuthSession } from './entities/session.entity.js';
import { AuthRefreshOperation } from './entities/refresh-operation.entity.js';
import {
  v2ProofCookieName,
  v2RefreshCookieName,
} from './refresh-recovery-v2.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { User } from '../users/entities/user.entity.js';
import type { UsersService } from '../users/users.service.js';
import type { MailService } from '../mail/mail.service.js';
import type { TotpService } from './totp.service.js';

function barrier() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const genOpId = () => randomBytes(32).toString('base64url');

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('refresh V1 e V2 no PostgreSQL', () => {
  let db: DataSource;
  const ids: string[] = [];
  const config = new ConfigService({
    NODE_ENV: 'development',
    FRONTEND_URL: 'http://localhost:5173',
    JWT_SECRET: 'synthetic-access-secret-v2-test',
    JWT_REFRESH_SECRET: 'synthetic-refresh-secret-v2-test',
    TOTP_ENCRYPTION_KEY: 'a'.repeat(64),
    JWT_EXPIRES_IN: 900,
    JWT_REFRESH_EXPIRES_IN: 604800,
  });

  beforeAll(async () => {
    db = new DataSource({ ...configured.options, migrations: [] });
    await db.initialize();
  });

  afterAll(async () => {
    if (!db?.isInitialized) return;
    try {
      await db.query('DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR target_id = ANY($1::uuid[])', [ids]);
      await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
    } finally {
      await db.destroy();
    }
  });

  async function fixture(customConfig: ConfigService = config) {
    const id = randomUUID();
    ids.push(id);
    await db.query(
      "INSERT INTO users(id,name,email,password_hash,role,email_verified) VALUES ($1,'Synthetic refresh concurrency',$2,'invalid-hash','READER',true)",
      [id, `${id}@example.invalid`],
    );
    const user = await db.getRepository(User).findOneByOrFail({ id });
    const repository = db.getRepository(AuthSession);
    const opRepository = db.getRepository(AuthRefreshOperation);
    let afterRead: (() => Promise<void>) | null = null;
    const coordinated = {
      manager: repository.manager,
      findOne: async (options: Parameters<typeof repository.findOne>[0]) => {
        const row = await repository.findOne(options);
        await afterRead?.();
        return row;
      },
      update: repository.update.bind(repository),
      find: repository.find.bind(repository),
    } as Repository<AuthSession>;
    const readUser = (userId: string) => db.getRepository(User).findOneBy({ id: userId });
    const users = { findByIdForAuth: readUser, findById: readUser } as unknown as UsersService;
    const jwt = new JwtService();
    const service = new AuthService(users, jwt, customConfig, {} as MailService, coordinated, {} as TotpService);
    const strategy = new JwtStrategy(customConfig, users, repository);
    const authorize = async (accessToken: string) =>
      strategy.validate(await jwt.verifyAsync(accessToken, { secret: customConfig.getOrThrow<string>('JWT_SECRET') }));
    const pair = await service.createSession(user);
    const [session] = await repository.findBy({ userId: id });
    const buildCookieHeader = (entries: { gen: number; rt?: string; proof?: string }[]) =>
      entries
        .flatMap(e => {
          const parts: string[] = [];
          if (e.rt !== undefined) parts.push(`${v2RefreshCookieName(pair.sessionId!, e.gen, false)}=${e.rt}`);
          if (e.proof !== undefined) parts.push(`${v2ProofCookieName(pair.sessionId!, e.gen, false)}=${e.proof}`);
          return parts;
        })
        .join('; ');
    return {
      user,
      service,
      pair,
      session,
      repository,
      opRepository,
      authorize,
      buildCookieHeader,
      pause: (callback: (() => Promise<void>) | null) => { afterRead = callback; },
    };
  }

  // --- V1 Legacy Concurrency Tests ---
  it('V1: rejeita o perdedor do CAS sem revogar o vencedor e ainda detecta reuso posterior', async () => {
    const f = await fixture(), entered = barrier(), release = barrier();
    let reads = 0;
    f.pause(async () => { if (++reads === 2) entered.resolve(); await release.promise; });
    const outcomes = Promise.allSettled([f.service.refresh(f.pair.refreshToken), f.service.refresh(f.pair.refreshToken)]);
    try { await entered.promise; } finally { release.resolve(); }
    const results = await outcomes;
    const winner = results.find(result => result.status === 'fulfilled');
    expect(winner?.status).toBe('fulfilled');
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const [stored] = await db.query('SELECT token_hash FROM auth_sessions WHERE id=$1', [f.session.id]);
    expect(stored.token_hash).toBe(hash(winner!.value.refreshToken));
    expect((await f.authorize(winner!.value.accessToken)).userId).toBe(f.session.userId);
    f.pause(null);
    await expect(f.service.refresh(f.pair.refreshToken)).rejects.toThrow('reutilizado');
    expect(await f.repository.existsBy({ id: f.session.id })).toBe(false);
    await expect(f.authorize(winner!.value.accessToken)).rejects.toThrow('Sessão revogada');
  });

  it('V1: nao apaga um snapshot mais novo quando detecta um token ja obsoleto', async () => {
    const f = await fixture();
    const current = await f.service.refresh(f.pair.refreshToken);
    const entered = barrier(), release = barrier();
    f.pause(async () => { entered.resolve(); await release.promise; });
    const obsolete = f.service.refresh(f.pair.refreshToken);
    const rejected = expect(obsolete).rejects.toThrow('reutilizado');
    await entered.promise;
    f.pause(null);
    let newest;
    try { newest = await f.service.refresh(current.refreshToken); } finally { release.resolve(); }
    await rejected;
    const [stored] = await db.query('SELECT token_hash FROM auth_sessions WHERE id=$1', [f.session.id]);
    expect(stored.token_hash).toBe(hash(newest.refreshToken));
  });

  it('V1: mantem registro expirado ou com authVersion invalida sem apagar outra sessao', async () => {
    const expired = await fixture();
    await expired.repository.update(expired.session.id, { expiresAt: new Date(0) });
    await expect(expired.service.refresh(expired.pair.refreshToken)).rejects.toThrow('Sessão expirada');
    expect(await expired.repository.existsBy({ id: expired.session.id })).toBe(true);
    await expect(expired.authorize(expired.pair.accessToken)).rejects.toThrow('Sessão revogada');
    const invalid = await fixture();
    await db.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1', [invalid.session.userId]);
    await expect(invalid.service.refresh(invalid.pair.refreshToken)).rejects.toThrow('Sessão expirada');
    expect(await invalid.repository.existsBy({ id: invalid.session.id })).toBe(true);
    await expect(invalid.authorize(invalid.pair.accessToken)).rejects.toThrow('Usuário desativado');
  });

  it('V1: expiracao durante a chamada perde o CAS sem deletar o registro', async () => {
    const f = await fixture(), entered = barrier(), release = barrier();
    f.pause(async () => { entered.resolve(); await release.promise; });
    const outcome = expect(f.service.refresh(f.pair.refreshToken)).rejects.toThrow('Sessão alterada');
    await entered.promise;
    try { await f.repository.update(f.session.id, { expiresAt: new Date(0) }); } finally { release.resolve(); }
    await outcome;
    expect(await f.repository.existsBy({ id: f.session.id })).toBe(true);
  });

  it('V1: logout durante refresh permanece revogado e o refresh nao recria a sessao', async () => {
    const f = await fixture(), entered = barrier(), release = barrier();
    f.pause(async () => { entered.resolve(); await release.promise; });
    const outcome = expect(f.service.refresh(f.pair.refreshToken)).rejects.toThrow('Sessão alterada');
    await entered.promise;
    try { await f.service.logout(f.session.userId, f.session.id); } finally { release.resolve(); }
    await outcome;
    expect(await f.repository.existsBy({ id: f.session.id })).toBe(false);
  });

  // --- V2 Protocol Transactional & Recovery Tests ---
  it('V2: uma aba antiga no endpoint legado não pode rotacionar nem revogar a sessão V2', async () => {
    const f = await fixture();
    await expect(f.service.refresh(f.pair.refreshToken, true)).rejects.toThrow('protocolo');
    const rotated = await f.service.refreshV2({ sessionIdHeader: f.pair.sessionId, operationIdHeader: genOpId(), generationHeader: '0', rawCookieHeader: f.buildCookieHeader([{ gen: 0, rt: f.pair.refreshToken, proof: f.pair.recoveryProof }]), originHeader: 'http://localhost:5173' });
    await expect(f.service.refresh(f.pair.refreshToken, true)).rejects.toThrow('protocolo');
    expect((await f.authorize(rotated.accessToken)).userId).toBe(f.user.id);
    expect(await f.repository.existsBy({ id: f.session.id })).toBe(true);
  });
  it('V2: a limpeza periódica remove ciphertext e metadados expirados com locks válidos no PostgreSQL', async () => {
    const f = await fixture();
    await f.service.refreshV2({ sessionIdHeader: f.pair.sessionId, operationIdHeader: genOpId(), generationHeader: '0', rawCookieHeader: f.buildCookieHeader([{ gen: 0, rt: f.pair.refreshToken, proof: f.pair.recoveryProof }]), originHeader: 'http://localhost:5173' });
    await db.query("UPDATE auth_refresh_operations SET result_expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1", [f.session.id]);
    await f.service.cleanupExpiredRefreshOperations();
    expect((await f.opRepository.findBy({ sessionId: f.session.id }))[0].resultCiphertext).toBeNull();
    await db.query("UPDATE auth_refresh_operations SET metadata_expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1", [f.session.id]);
    await f.service.cleanupExpiredRefreshOperations();
    expect(await f.opRepository.countBy({ sessionId: f.session.id })).toBe(0);
  });

  it('V2: metadados históricos não esgotam a capacidade de novas rotações', async () => {
    const f = await fixture();
    let rt = f.pair.refreshToken, proof = f.pair.recoveryProof!, generation = 0;
    for (let index = 0; index < 65; index++) {
      const result = await f.service.refreshV2({ sessionIdHeader: f.pair.sessionId, operationIdHeader: genOpId(), generationHeader: String(generation), rawCookieHeader: f.buildCookieHeader([{ gen: generation, rt, proof }]), originHeader: 'http://localhost:5173' });
      rt = result.refreshToken; proof = result.recoveryProof; generation = result.generation;
      await db.query("UPDATE auth_refresh_operations SET result_expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1", [f.session.id]);
    }
    expect(generation).toBe(65);
    expect(await f.opRepository.countBy({ sessionId: f.session.id })).toBe(65);
  });

  it('V2: após expirar recuperação, só token ATUAL mais prova autorizam avançar a geração', async () => {
    const f = await fixture(), operation = genOpId();
    const request = { sessionIdHeader: f.pair.sessionId, operationIdHeader: operation, generationHeader: '0', rawCookieHeader: f.buildCookieHeader([{ gen: 0, rt: f.pair.refreshToken, proof: f.pair.recoveryProof }]), originHeader: 'http://localhost:5173' };
    const result = await f.service.refreshV2(request);
    await db.query("UPDATE auth_refresh_operations SET result_expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1", [f.session.id]);
    try { await f.service.refreshV2(request); throw new Error('Expected recovery expiration'); }
    catch (error) { expect((error as { getResponse: () => unknown }).getResponse()).toMatchObject({ code: 'RECOVERY_EXPIRED' }); expect((error as { getResponse: () => unknown }).getResponse()).not.toHaveProperty('retry_generation'); }
    const currentCookies = f.buildCookieHeader([{ gen: 1, rt: result.refreshToken, proof: result.recoveryProof }]);
    try { await f.service.refreshV2({ ...request, rawCookieHeader: currentCookies }); throw new Error('Expected coordination response'); }
    catch (error) { expect((error as { getResponse: () => unknown }).getResponse()).toMatchObject({ code: 'RECOVERY_EXPIRED', retry_generation: 1 }); }
    expect((await f.service.refreshV2({ ...request, operationIdHeader: genOpId(), generationHeader: '1', rawCookieHeader: currentCookies })).generation).toBe(2);
  });

  it('V2: logout concorrente não deixa uma rotação recriar a sessão revogada', async () => {
    const f = await fixture(), entered = barrier(), release = barrier();
    f.service.setTestHooks({ onBeforeCommit: async () => { entered.resolve(); await release.promise; } });
    const cookies = f.buildCookieHeader([{ gen: 0, rt: f.pair.refreshToken, proof: f.pair.recoveryProof }]);
    const refreshing = f.service.refreshV2({ sessionIdHeader: f.pair.sessionId, operationIdHeader: genOpId(), generationHeader: '0', rawCookieHeader: cookies, originHeader: 'http://localhost:5173' });
    await entered.promise;
    const loggingOut = f.service.logoutV2({ sessionIdHeader: f.pair.sessionId, rawCookieHeader: cookies, originHeader: 'http://localhost:5173' });
    release.resolve();
    const [rotated] = await Promise.all([refreshing, loggingOut]);
    expect(await f.repository.existsBy({ id: f.session.id })).toBe(false);
    await expect(f.authorize(rotated.accessToken)).rejects.toThrow();
  });

  it('V2 (I1/I2/I3/I5): duas chamadas concorrentes com mesmo operation_id rotacionam 1x e devolvem exatamente o mesmo par cifrado sem estender prazos', async () => {
    const f = await fixture();
    const opId = genOpId();
    const lockedBarrier = barrier();
    const releaseBarrier = barrier();
    let lockCalls = 0;

    f.service.setTestHooks({
      onSessionLocked: async () => {
        if (++lockCalls === 1) {
          lockedBarrier.resolve();
          await releaseBarrier.promise;
        }
      },
    });

    const reqInput = {
      sessionIdHeader: f.pair.sessionId,
      operationIdHeader: opId,
      generationHeader: '0',
      rawCookieHeader: f.buildCookieHeader([{ gen: 0, rt: f.pair.refreshToken, proof: f.pair.recoveryProof }]),
      originHeader: 'http://localhost:5173',
    };

    const callA = f.service.refreshV2(reqInput);
    await lockedBarrier.promise;
    const callB = f.service.refreshV2(reqInput);
    releaseBarrier.resolve();

    const [resA, resB] = await Promise.all([callA, callB]);
    f.service.setTestHooks(null);

    expect([resA.kind, resB.kind].sort()).toEqual(['created', 'recovered']);
    expect(resA.accessToken).toBe(resB.accessToken);
    expect(resA.refreshToken).toBe(resB.refreshToken);
    expect(resA.generation).toBe(1);
    expect(resB.generation).toBe(1);
    expect(resA.recoveryDeadlineIso).toBe(resB.recoveryDeadlineIso);

    const [stored] = await db.query(
      'SELECT refresh_generation, token_hash, expires_at FROM auth_sessions WHERE id=$1',
      [f.session.id],
    );
    expect(Number(stored.refresh_generation)).toBe(1);
    expect(stored.token_hash).toBe(hash(resA.refreshToken));

    const ops = await f.opRepository.findBy({ sessionId: f.session.id });
    expect(ops).toHaveLength(1);
    expect((await f.authorize(resB.accessToken)).userId).toBe(f.user.id);
  });

  it('V2 (Scenario 6 - Multi-instancia): Instancia A comita e Instancia B recupera a mesma operacao pelo PostgreSQL compartilhado', async () => {
    const f = await fixture();
    // Create an independent AuthService instance B sharing only DB and Config
    const readUser = (userId: string) => db.getRepository(User).findOneBy({ id: userId });
    const usersB = { findByIdForAuth: readUser, findById: readUser } as unknown as UsersService;
    const serviceB = new AuthService(usersB, new JwtService(), config, {} as MailService, db.getRepository(AuthSession), {} as TotpService);

    const opId = genOpId();
    const reqInput = {
      sessionIdHeader: f.pair.sessionId,
      operationIdHeader: opId,
      generationHeader: '0',
      rawCookieHeader: f.buildCookieHeader([{ gen: 0, rt: f.pair.refreshToken, proof: f.pair.recoveryProof }]),
      originHeader: 'http://localhost:5173',
    };

    const resA = await f.service.refreshV2(reqInput);
    expect(resA.kind).toBe('created');

    // Retry on Instance B with the exact same input cookie (simulating lost response from Instance A)
    const resB = await serviceB.refreshV2(reqInput);
    expect(resB.kind).toBe('recovered');
    expect(resB.accessToken).toBe(resA.accessToken);
    expect(resB.refreshToken).toBe(resA.refreshToken);
    expect(resB.generation).toBe(1);
  });

  it('V2 (I4): retorna 409 OPERATION_SUPERSEDED quando a operacao ja foi superada por g2, e presenca de cookie g0 residual junto com g1 nao revoga', async () => {
    const f = await fixture();
    const op1 = genOpId();
    const op2 = genOpId();

    const r1 = await f.service.refreshV2({
      sessionIdHeader: f.pair.sessionId,
      operationIdHeader: op1,
      generationHeader: '0',
      rawCookieHeader: f.buildCookieHeader([{ gen: 0, rt: f.pair.refreshToken, proof: f.pair.recoveryProof }]),
      originHeader: 'http://localhost:5173',
    });
    expect(r1.generation).toBe(1);

    // Send both g0 residual cookie and g1 current cookie in op2
    const r2 = await f.service.refreshV2({
      sessionIdHeader: f.pair.sessionId,
      operationIdHeader: op2,
      generationHeader: '1',
      rawCookieHeader: f.buildCookieHeader([
        { gen: 0, rt: f.pair.refreshToken, proof: f.pair.recoveryProof },
        { gen: 1, rt: r1.refreshToken, proof: r1.recoveryProof },
      ]),
      originHeader: 'http://localhost:5173',
    });
    expect(r2.generation).toBe(2);
    expect(r2.clearGenerations).toContain(0);
    expect(r2.clearGenerations).toContain(1);

    // Now replay op1: should get 409 OPERATION_SUPERSEDED without revoking the session!
    await expect(
      f.service.refreshV2({
        sessionIdHeader: f.pair.sessionId,
        operationIdHeader: op1,
        generationHeader: '0',
        rawCookieHeader: f.buildCookieHeader([{ gen: 0, rt: f.pair.refreshToken, proof: f.pair.recoveryProof }]),
        originHeader: 'http://localhost:5173',
      }),
    ).rejects.toThrow(/superada/);

    expect(await f.repository.existsBy({ id: f.session.id })).toBe(true);
    expect((await f.authorize(r2.accessToken)).userId).toBe(f.user.id);
  });

  it('V2 (I2/I5/Scenario 8): retorna 409 RECOVERY_EXPIRED apos o prazo de recuperacao e cleanup remove ciphertext preservando metadados', async () => {
    const f = await fixture();
    const op1 = genOpId();
    const r1 = await f.service.refreshV2({
      sessionIdHeader: f.pair.sessionId,
      operationIdHeader: op1,
      generationHeader: '0',
      rawCookieHeader: f.buildCookieHeader([{ gen: 0, rt: f.pair.refreshToken, proof: f.pair.recoveryProof }]),
      originHeader: 'http://localhost:5173',
    });
    expect(r1.kind).toBe('created');

    // Expire result_expires_at in DB for this fixture
    await db.query(
      `UPDATE auth_refresh_operations SET result_expires_at = clock_timestamp() - interval '1 second' WHERE session_id = $1`,
      [f.session.id],
    );

    await expect(
      f.service.refreshV2({
        sessionIdHeader: f.pair.sessionId,
        operationIdHeader: op1,
        generationHeader: '0',
        rawCookieHeader: f.buildCookieHeader([{ gen: 0, rt: f.pair.refreshToken, proof: f.pair.recoveryProof }]),
        originHeader: 'http://localhost:5173',
      }),
    ).rejects.toThrow(/expirou/);

    const [opRow] = await db.query(
      `SELECT result_ciphertext, output_hash FROM auth_refresh_operations WHERE session_id = $1`,
      [f.session.id],
    );
    expect(opRow.result_ciphertext).toBeNull();
    expect(opRow.output_hash).toBe(hash(r1.refreshToken));
  });

  it('V2 (I2/I8/I11 - Matriz negativa de seguranca): ID isolado, prova isolada, prova errada ou sessao alheia falham sem revogar; token antigo + prova correta + ID diferente revoga com commit', async () => {
    const f = await fixture();
    const other = await fixture();
    const op1 = genOpId();

    const r1 = await f.service.refreshV2({
      sessionIdHeader: f.pair.sessionId,
      operationIdHeader: op1,
      generationHeader: '0',
      rawCookieHeader: f.buildCookieHeader([{ gen: 0, rt: f.pair.refreshToken, proof: f.pair.recoveryProof }]),
      originHeader: 'http://localhost:5173',
    });

    // 1. Only operationId (no cookies) -> 401, session remains intact
    await expect(
      f.service.refreshV2({
        sessionIdHeader: f.pair.sessionId,
        operationIdHeader: op1,
        generationHeader: '0',
        rawCookieHeader: '',
        originHeader: 'http://localhost:5173',
      }),
    ).rejects.toThrow();
    expect(await f.repository.existsBy({ id: f.session.id })).toBe(true);

    // 2. Old token without proof -> 401, session remains intact (cannot DoS-revoke without proof!)
    await expect(
      f.service.refreshV2({
        sessionIdHeader: f.pair.sessionId,
        operationIdHeader: genOpId(),
        generationHeader: '0',
        rawCookieHeader: f.buildCookieHeader([{ gen: 0, rt: f.pair.refreshToken }]),
        originHeader: 'http://localhost:5173',
      }),
    ).rejects.toThrow();
    expect(await f.repository.existsBy({ id: f.session.id })).toBe(true);

    // 3. Old token + proof from OTHER session -> 401, session remains intact
    await expect(
      f.service.refreshV2({
        sessionIdHeader: f.pair.sessionId,
        operationIdHeader: genOpId(),
        generationHeader: '0',
        rawCookieHeader: f.buildCookieHeader([{ gen: 0, rt: f.pair.refreshToken, proof: other.pair.recoveryProof }]),
        originHeader: 'http://localhost:5173',
      }),
    ).rejects.toThrow();
    expect(await f.repository.existsBy({ id: f.session.id })).toBe(true);

    // 4. Old signed token (g0) + valid session proof + DIFFERENT operation ID -> proven reuse -> revokes session with commit!
    await expect(
      f.service.refreshV2({
        sessionIdHeader: f.pair.sessionId,
        operationIdHeader: genOpId(),
        generationHeader: '0',
        rawCookieHeader: f.buildCookieHeader([{ gen: 0, rt: f.pair.refreshToken, proof: f.pair.recoveryProof }]),
        originHeader: 'http://localhost:5173',
      }),
    ).rejects.toThrow(/reutilizado/);

    expect(await f.repository.existsBy({ id: f.session.id })).toBe(false);
    await expect(f.authorize(r1.accessToken)).rejects.toThrow('Sessão revogada');
  });

  it('V2 (Scenario 7 & 11): revogacao por authVersion e logoutV2 com cookies durante refresh incerto invalidam acesso', async () => {
    const f = await fixture();
    const op1 = genOpId();
    const r1 = await f.service.refreshV2({
      sessionIdHeader: f.pair.sessionId,
      operationIdHeader: op1,
      generationHeader: '0',
      rawCookieHeader: f.buildCookieHeader([{ gen: 0, rt: f.pair.refreshToken, proof: f.pair.recoveryProof }]),
      originHeader: 'http://localhost:5173',
    });

    // Bump auth_version (simulating revokeUserSessions / password reset)
    await db.query('UPDATE users SET auth_version = auth_version + 1 WHERE id = $1', [f.user.id]);

    await expect(
      f.service.refreshV2({
        sessionIdHeader: f.pair.sessionId,
        operationIdHeader: op1,
        generationHeader: '0',
        rawCookieHeader: f.buildCookieHeader([{ gen: 0, rt: f.pair.refreshToken, proof: f.pair.recoveryProof }]),
        originHeader: 'http://localhost:5173',
      }),
    ).rejects.toThrow(/invalidada/);

    await expect(f.authorize(r1.accessToken)).rejects.toThrow();

    // Test logoutV2 using only v2 cookies + proof (no bearer token, as during uncertain refresh)
    const f2 = await fixture();
    const logoutRes = await f2.service.logoutV2({
      sessionIdHeader: f2.pair.sessionId,
      rawCookieHeader: f2.buildCookieHeader([{ gen: 0, rt: f2.pair.refreshToken, proof: f2.pair.recoveryProof }]),
      originHeader: 'http://localhost:5173',
    });
    expect(logoutRes.sessionId).toBe(f2.pair.sessionId);
    expect(await f2.repository.existsBy({ id: f2.session.id })).toBe(false);
  });

  it('V2 (Scenario 9): falha no banco antes do commit faz rollback integral e permite concluir a mesma tentativa depois', async () => {
    const f = await fixture();
    const op1 = genOpId();

    f.service.setTestHooks({
      onBeforeCommit: () => {
        throw new Error('simulated db error before commit');
      },
    });

    await expect(
      f.service.refreshV2({
        sessionIdHeader: f.pair.sessionId,
        operationIdHeader: op1,
        generationHeader: '0',
        rawCookieHeader: f.buildCookieHeader([{ gen: 0, rt: f.pair.refreshToken, proof: f.pair.recoveryProof }]),
        originHeader: 'http://localhost:5173',
      }),
    ).rejects.toThrow(/indisponível/);

    // Session must remain at generation 0 with original hash
    const [stored] = await db.query('SELECT refresh_generation, token_hash FROM auth_sessions WHERE id=$1', [f.session.id]);
    expect(Number(stored.refresh_generation)).toBe(0);
    expect(stored.token_hash).toBe(hash(f.pair.refreshToken));

    // Removing the fault allows the exact same operationId to complete cleanly
    f.service.setTestHooks(null);
    const recovered = await f.service.refreshV2({
      sessionIdHeader: f.pair.sessionId,
      operationIdHeader: op1,
      generationHeader: '0',
      rawCookieHeader: f.buildCookieHeader([{ gen: 0, rt: f.pair.refreshToken, proof: f.pair.recoveryProof }]),
      originHeader: 'http://localhost:5173',
    });
    expect(recovered.kind).toBe('created');
    expect(recovered.generation).toBe(1);
  });
});
