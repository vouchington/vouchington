import { randomBytes, randomUUID } from 'node:crypto'
import type { TransactionQuery } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'

type Family =
  | 'activitypub_post_likes'
  | 'remote_actors'
  | 'feed_hostname_blocks'
  | 'other_hostname_blocks'
  | 'deleted_conversations'
  | 'app_attestation_keys'

export async function resetOperationalRetentionCursorForTest(
  query: TransactionQuery,
  family: Family,
): Promise<void> {
  await query(
    `/* resetOperationalRetentionCursorForTest */
     DELETE FROM operational_tombstone_retention_cursors WHERE cleanup_name = $1`,
    [family],
  )
}

export async function getOperationalRetentionCursorForTest(
  query: TransactionQuery,
  family: Family,
): Promise<{ cursor_id: string | null; sweep_cutoff_at: Date | null }> {
  const { rows } = await query<{ cursor_id: string | null; sweep_cutoff_at: Date | null }>(
    `/* getOperationalRetentionCursorForTest */
     SELECT cursor_id, sweep_cutoff_at FROM operational_tombstone_retention_cursors
     WHERE cleanup_name = $1`,
    [family],
  )
  return rows[0] ?? { cursor_id: null, sweep_cutoff_at: null }
}

export async function insertOperationalHostnameBlockForTest(
  query: TransactionQuery,
  input: { feed: boolean; liftedAt: Date | null },
): Promise<{ id: string; hostnameId: string }> {
  const hostname = `retention-${randomUUID()}.example`
  const { rows: hostRows } = await query<{ id: string }>(
    `/* insertOperationalHostnameForTest */
     INSERT INTO url_hostnames (hostname) VALUES ($1) RETURNING id`,
    [hostname],
  )
  const hostnameId = hostRows[0]!.id
  let sourceId: number | null = null
  if (input.feed) {
    const name = `retention${randomUUID().replaceAll(/[^a-f]/g, 'a')}`
    const { rows } = await query<{ id: number }>(
      `/* insertOperationalBlocklistSourceForTest */
       INSERT INTO domain_blocklist_sources (type, name, url)
       VALUES ('url', $1, $2) RETURNING id`,
      [name, `https://${hostname}/source`],
    )
    sourceId = rows[0]!.id
  }
  const { rows } = await query<{ id: string }>(
    `/* insertOperationalHostnameBlockForTest */
     INSERT INTO url_hostname_blocks
       (url_hostname_id, blocked_source, domain_blocklist_source_id, lifted_at)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [hostnameId, input.feed ? 'url_blocklist' : 'admin', sourceId, input.liftedAt],
  )
  return { id: rows[0]!.id, hostnameId }
}

export async function operationalRowExistsForTest(
  query: TransactionQuery,
  table:
    | 'activitypub_post_likes'
    | 'remote_actors'
    | 'url_hostname_blocks'
    | 'app_attestation_keys'
    | 'conversations',
  id: string,
): Promise<boolean> {
  const { rows } = await query<{ exists: boolean }>(
    `/* operationalRowExistsForTest */
     SELECT EXISTS(SELECT 1 FROM ${table} WHERE id = $1::uuid) AS exists`,
    [id],
  )
  return rows[0]!.exists
}

export async function getOperationalHostnameBlockedForTest(
  query: TransactionQuery,
  hostnameId: string,
): Promise<boolean> {
  const { rows } = await query<{ is_blocked: boolean }>(
    `/* getOperationalHostnameBlockedForTest */
     SELECT is_blocked FROM url_hostnames WHERE id = $1::uuid`,
    [hostnameId],
  )
  return rows[0]!.is_blocked
}

export async function insertOperationalAttestationKeyForTest(
  query: TransactionQuery,
  input: { usedAt: Date | null; createdAt?: Date },
): Promise<string> {
  const id = input.createdAt ? getMinUUIDv7ForDate(input.createdAt) : undefined
  const { rows } = await query<{ id: string }>(
    `/* insertOperationalAttestationKeyForTest */
     INSERT INTO app_attestation_keys
       (id, key_id, did, public_key, bundle_id, environment, last_used_at)
     VALUES (COALESCE($1::uuid, uuidv7()), $2, uuidv7(), $3, 'io.voucha.test', 'production', $4)
     RETURNING id`,
    [id ?? null, randomBytes(32), randomBytes(20), input.usedAt],
  )
  return rows[0]!.id
}
