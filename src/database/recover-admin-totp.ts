import dataSource from './data-source.js';
import { authorizeRecovery, lockRecoveryUser } from '../modules/auth/totp-recovery-operations.js';

// No passwords, tokens or TOTP secrets in arguments or stdout. Dry-run is the default.
const options = new Map<string, string>();
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 2) {
  if (!['--user-id', '--email', '--operator', '--reason', '--confirm', '--destination'].includes(args[index]) || !args[index + 1] || options.has(args[index])) throw new Error('Argumentos inválidos. Consulte docs/TOTP_RECOVERY.md.');
  options.set(args[index], args[index + 1]);
}
const id = options.get('--user-id') ?? '';
const email = options.get('--email') ?? '';
const operator = options.get('--operator')?.trim() ?? '';
const reason = options.get('--reason')?.trim() ?? '';
const destination = options.get('--destination') ?? 'primary';
if (destination !== 'primary' && destination !== 'secondary') throw new Error('--destination deve ser primary ou secondary.');
if (!/^[0-9a-f-]{36}$/i.test(id) || !email || operator.length < 3 || operator.length > 200 || reason.length < 10 || reason.length > 1000) throw new Error('Informe --user-id UUID --email EMAIL --operator OPERADOR --reason "referência do atendimento e verificação".');
if (options.has('--confirm') && options.get('--confirm') !== id) throw new Error('--confirm deve repetir exatamente o UUID da conta.');
const frontendUrl = process.env.FRONTEND_URL ?? '';
const jwtSecret = process.env.JWT_SECRET ?? '';
if (!jwtSecret || !frontendUrl || (process.env.NODE_ENV === 'production' && new URL(frontendUrl).protocol !== 'https:')) throw new Error('Configure JWT_SECRET e FRONTEND_URL (HTTPS em produção) no ambiente do servidor.');

await dataSource.initialize();
try {
  await dataSource.transaction(async manager => {
    const user = await lockRecoveryUser(manager, id);
    if (!user || user.email.toLowerCase() !== email.toLowerCase() || !['ADMIN', 'SUPER_ADMIN'].includes(user.role) || !user.totp_enabled) throw new Error('Conta administrativa ativa, verificada e com autenticador não encontrada para esse UUID e e-mail.');
    if (destination === 'secondary' && (!user.recovery_email || !user.recovery_email_verified_at)) throw new Error('A conta não possui e-mail secundário verificado.');
    if (!options.has('--confirm')) {
      process.stdout.write(`Simulação: conta ${user.id}, papel ${user.role}. Nenhuma alteração realizada. Repita com --confirm ${user.id} após verificar identidade e aprovar o atendimento.\n`);
      return;
    }
    const result = await authorizeRecovery(manager, user, { operator, reason }, { frontendUrl, jwtSecret }, destination);
    process.stdout.write(`Autorização registrada; mensagem na outbox do e-mail cadastrado. Disponível em ${result.availableAt}, expira em ${result.expiresAt}. O autenticador permanece ativo.\n`);
  });
} finally {
  await dataSource.destroy();
}
