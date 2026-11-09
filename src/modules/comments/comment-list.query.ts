// Explicit projections prevent public comment responses from exposing user credentials.
const projection = (comment: string, author: string, replyAuthor?: string) => `jsonb_build_object(
  'id', ${comment}.id, 'postId', ${comment}.post_id, 'rootId', ${comment}.root_id,
  'replyToId', ${comment}.reply_to_id,
  'replyToAuthor', ${replyAuthor ? `CASE WHEN ${replyAuthor}.id IS NULL OR ${replyAuthor}.deleted_at IS NOT NULL THEN NULL ELSE jsonb_build_object('id', ${replyAuthor}.id, 'name', ${replyAuthor}.name) END` : 'NULL'},
  'author', CASE WHEN ${comment}.is_active = false OR ${author}.deleted_at IS NOT NULL THEN jsonb_build_object('id', NULL, 'name', 'Conta encerrada', 'profilePhoto', NULL) ELSE jsonb_build_object('id', ${author}.id, 'name', ${author}.name, 'profilePhoto', ${author}.profile_photo) END,
  'content', CASE WHEN ${comment}.is_active = false THEN 'Comentário excluído' ELSE ${comment}.content END, 'isActive', ${comment}.is_active,
  'editedAt', ${comment}.edited_at, 'createdAt', ${comment}.created_at)`;

export function commentListQuery(cursorMode: boolean, hasCursor: boolean): string {
  return `WITH roots AS MATERIALIZED (
    SELECT c.* FROM comments c WHERE c.post_id = $1 AND c.root_id IS NULL
      ${hasCursor ? 'AND (c.created_at, c.id) < ($4::timestamptz, $5::uuid)' : ''}
    ORDER BY c.created_at DESC, c.id DESC LIMIT $2 OFFSET $3
  ), items AS (
    SELECT ${projection('r', 'a')} AS comment,
      to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS timestamp,
      r.created_at, r.id, preview.data AS replies, preview.total AS reply_count
    FROM roots r JOIN users a ON a.id = r.author_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(${projection('c', 'u', 'target_author')} ORDER BY c.created_at, c.id) AS data,
        max(c.total)::int AS total
      FROM (SELECT c.*, count(*) OVER () AS total FROM comments c
        WHERE c.post_id = $1 AND c.root_id = r.id ORDER BY c.created_at, c.id LIMIT 5) c
      JOIN users u ON u.id = c.author_id
      LEFT JOIN comments target ON target.id = c.reply_to_id
      LEFT JOIN users target_author ON target_author.id = target.author_id
    ) preview ON true
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('comment', comment, 'timestamp', timestamp,
      'replies', coalesce(replies, '[]'::jsonb), 'replyCount', coalesce(reply_count, 0)) ORDER BY created_at DESC, id DESC), '[]'::jsonb) AS items,
    ${cursorMode ? '0::int' : '(SELECT count(*)::int FROM comments WHERE post_id = $1 AND root_id IS NULL)'} AS total
    FROM items`;
}
