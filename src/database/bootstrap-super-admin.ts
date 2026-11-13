import dataSource from './data-source.js';

const userId = process.argv[2];
if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
  throw new Error('Informe o UUID da conta ativa e verificada como argumento.');
}

await dataSource.initialize();
try {
  await dataSource.transaction(async manager => {
    await manager.query("SELECT pg_advisory_xact_lock(hashtext('griforio.admin.roles'))");
    const owners: { count: string }[] = await manager.query("SELECT count(*)::text AS count FROM users WHERE role = 'SUPER_ADMIN' AND deleted_at IS NULL");
    if (Number(owners[0].count) !== 0) throw new Error('Já existe uma conta SUPER_ADMIN; bootstrap recusado.');
    const rows: { id: string; role: string }[] = await manager.query('SELECT id, role FROM users WHERE id = $1 AND is_active = true AND email_verified = true AND totp_enabled = true AND recovery_email IS NOT NULL AND recovery_email_verified_at IS NOT NULL AND deleted_at IS NULL FOR UPDATE', [userId]);
    if (!rows.length) throw new Error('A conta deve estar ativa, com 2FA e e-mails principal e secundário verificados antes do bootstrap.');
    await manager.query("UPDATE users SET role = 'SUPER_ADMIN', first_post_approved = true, auth_version = auth_version + 1, refresh_token_hash = NULL WHERE id = $1", [userId]);
    if (rows[0].role === 'AUTHOR') {
      const rejected: { id: string }[] = await manager.query("UPDATE posts SET review_status = 'REJECTED', review_note = 'A função de autoria foi alterada; a revisão foi encerrada.' WHERE author_id = $1 AND review_status = 'PENDING' RETURNING id", [userId]);
      for (const post of rejected) await manager.query("INSERT INTO audit_logs (actor_id, action, target_type, target_id, details) VALUES (NULL, 'post.review_cancelled', 'post', $1, $2::jsonb)", [post.id, JSON.stringify({ reason: 'Função de autoria alterada', userId })]);
    }
    await manager.query("INSERT INTO audit_logs (actor_id, action, target_type, target_id, details) VALUES (NULL, 'user.super_admin_bootstrap', 'user', $1, $2::jsonb)", [userId, JSON.stringify({ previousRole: rows[0].role })]);
  });
  process.stdout.write('SUPER_ADMIN configurado; sessões anteriores foram invalidadas.\n');
} finally {
  await dataSource.destroy();
}
