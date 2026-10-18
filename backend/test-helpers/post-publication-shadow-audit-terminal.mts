import type { QueryExecutor } from '@data-stores/psql'
import { getDateFromUUIDv7 } from '@modules/utils/ids'
import { v7 as uuidv7 } from 'uuid'

/** Inserts owned witnesses and observes real global boundaries in the caller's fenced snapshot. */
export async function insertShadowAuditTerminalWitnesses(query: QueryExecutor, userId: string) {
  // Read the actual maximum from this fenced snapshot. Witness IDs must be after dirty-database
  // rows even when their UUIDv7 timestamp is ahead of the local clock.
  const { rows: observed } = await query<{
    maximum: string | null
  }>(`/* readShadowAuditObservedMaximum */
    WITH maxima AS MATERIALIZED (
      (SELECT id FROM posts ORDER BY id DESC LIMIT 1)
      UNION
      (SELECT post_identity_id AS id FROM post_publication_projection_receipts
        ORDER BY post_identity_id DESC LIMIT 1)
    )
    SELECT id AS maximum FROM maxima ORDER BY id DESC LIMIT 1`)
  const maximum = observed[0]?.maximum
  if (!maximum) throw new Error('Expected an existing global shadow audit boundary')
  const maximumDate = getDateFromUUIDv7(maximum)
  if (!maximumDate) throw new Error('Expected the global shadow audit boundary to be UUIDv7')
  // UUIDv7 timestamps use 48 bits; fail closed rather than wrapping at the representable ceiling.
  const nextMsecs = maximumDate.getTime() + 1
  if (nextMsecs >= 2 ** 48)
    throw new Error('Global shadow audit boundary leaves no UUIDv7 successor')
  const plannedIds = [uuidv7({ msecs: nextMsecs, seq: 0 }), uuidv7({ msecs: nextMsecs, seq: 1 })]

  // New rows remain private to this already-fenced RR transaction, including rollback.
  const { rows } = await query<{ id: string }>(
    `/* insertShadowAuditOwnedTerminalPosts */
  INSERT INTO posts (id, post_type, title, markdown, created_by_id, created_via,
    bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
  SELECT id, 'discussion'::post_types, 'Owned shadow checkpoint witness',
    'Transaction-private source for the global terminal page.', $1::uuid,
    'system'::content_creation_channels, $2::bytea, $2::bytea
  FROM unnest($3::uuid[]) AS witnesses(id)
  ORDER BY id
  RETURNING id`,
    [userId, Buffer.alloc(32), plannedIds],
  )
  const ids = rows.map(row => row.id).toSorted()
  if (ids.length !== 2 || new Set(ids).size !== 2)
    throw new Error('Expected two distinct owned shadow audit witnesses')
  const { rows: boundaries } = await query<{ before: string | null; maximum: string }>(
    `/* readShadowAuditWitnessBoundaries */
    WITH predecessors AS MATERIALIZED (
      (SELECT id FROM posts WHERE id < $1::uuid ORDER BY id DESC LIMIT 1)
      UNION
      (SELECT post_identity_id AS id FROM post_publication_projection_receipts
        WHERE post_identity_id < $1::uuid ORDER BY post_identity_id DESC LIMIT 1)
    ), maxima AS MATERIALIZED (
      (SELECT id FROM posts ORDER BY id DESC LIMIT 1)
      UNION
      (SELECT post_identity_id AS id FROM post_publication_projection_receipts
        ORDER BY post_identity_id DESC LIMIT 1)
    )
    SELECT (SELECT id FROM predecessors ORDER BY id DESC LIMIT 1) AS before,
      (SELECT id FROM maxima ORDER BY id DESC LIMIT 1) AS maximum`,
    [ids[0]],
  )
  const boundary = boundaries[0]
  if (
    ids.length !== 2 ||
    !ids[0] ||
    !ids[1] ||
    ids[0] >= ids[1] ||
    !boundary ||
    boundary.maximum !== ids[1] ||
    boundary.before !== maximum
  )
    throw new Error('Expected observed global boundaries around the owned witnesses')
  return { ids, before: boundary.before, maximum: boundary.maximum }
}
