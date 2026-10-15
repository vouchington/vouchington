import type { QueryExecutor } from '@data-stores/psql'

/** Inserts real terminal witnesses privately in the caller's fenced snapshot and rollback. */
export async function insertShadowAuditTerminalWitnesses(query: QueryExecutor, userId: string) {
  const { rows: previous } = await query<{
    id: string
  }>(`/* readShadowAuditSnapshotMaximum */
          WITH source_ids AS MATERIALIZED (
(SELECT id FROM posts ORDER BY id DESC LIMIT 1)
UNION
(SELECT post_identity_id AS id FROM post_publication_projection_receipts ORDER BY post_identity_id DESC LIMIT 1)
          ) SELECT id FROM source_ids ORDER BY id DESC LIMIT 1`)
  const before = previous[0]?.id
  if (!before) throw new Error('Expected an actual source predecessor for terminal proof')
  // New rows remain private to this already-fenced RR transaction, including rollback.
  // Natural server UUIDv7 values must follow the snapshot; never manufacture a future ID.
  const { rows } = await query<{ id: string }>(
    `/* insertShadowAuditOwnedTerminalPosts */
  INSERT INTO posts (id, post_type, title, markdown, created_by_id, created_via,
    bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
  SELECT uuidv7(), 'discussion'::post_types, 'Owned shadow checkpoint witness',
    'Transaction-private source for the global terminal page.', $1::uuid,
    'system'::content_creation_channels, $2::bytea, $2::bytea
  FROM generate_series(1, 2)
  RETURNING id`,
    [userId, Buffer.alloc(32)],
  )
  const ids = rows.map(row => row.id).toSorted()
  if (ids.length !== 2 || new Set(ids).size !== 2 || ids.some(id => id <= before))
    throw new Error('Natural owned source identities must follow the actual snapshot maximum')
  return { before, ids }
}
