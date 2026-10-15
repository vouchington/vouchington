import {
  beginTransaction,
  read,
  registerPostCommitAction,
  withTransactionOptions,
  write,
} from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import { normalizeHostname } from '@ts-shared/utils/urls'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { upsertUrlHostnames } from '@services/urls-hostnames'
import { enqueueHostnameCacheInvalidation } from '@services/entity-cache/hostname-invalidation-work'
import { drainHostnameCacheInvalidationWork } from '@services/entity-cache/hostname-invalidation-drain'
type TopicHostnameLinkValidation = {
  topic_exists: boolean
  hostname_exists: boolean
  hostname_topic_id: string | null
}
async function getTopicHostnameLinkValidation(
  topicId: string,
  hostnameId: string,
  options: QueryOptions = {},
): Promise<TopicHostnameLinkValidation | undefined> {
  const { rows } = await read(
    sql`/* getTopicHostnameLinkValidation */
      WITH topic_row AS (
        SELECT 1
        FROM topics
        WHERE id = ${topicId}
          AND deleted_at IS NULL
          AND merged_into_topic_id IS NULL
      ),
      hostname_row AS (
        SELECT id, topic_id
        FROM url_hostnames
        WHERE id = ${hostnameId}
      )
      SELECT
        EXISTS (SELECT 1 FROM topic_row) AS topic_exists,
        EXISTS (SELECT 1 FROM hostname_row) AS hostname_exists,
        (SELECT topic_id FROM hostname_row) AS hostname_topic_id
    `,
    options,
  )
  return rows[0] as TopicHostnameLinkValidation | undefined
}
async function clearOtherHostnameLinks(
  topicId: string,
  hostnameId: string | null,
  options: QueryOptions = {},
): Promise<void> {
  // Clears only the current primary hostname (via topics.hostname_id), not additional hostnames; skips if it equals the new primary.
  await write(
    sql`/* clearOtherHostnameLinks */
      UPDATE url_hostnames
      SET topic_id = NULL
      -- no-mistakes-disable-next-line postgres-required-predicates: id-scoped lookup of a specific, already-validated topic's hostname_id, not a listing/existence query
      WHERE id = (SELECT hostname_id FROM topics WHERE id = ${topicId})
        AND topic_id = ${topicId}
        AND (${hostnameId}::uuid IS NULL OR id <> ${hostnameId}::uuid)
    `,
    options,
  )
}
async function updateTopicHostnameId(
  topicId: string,
  hostnameId: string | null,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* updateTopicHostnameId */
      UPDATE topics
      SET hostname_id = ${hostnameId}::uuid
      WHERE id = ${topicId}
    `)
  if (hostnameId) {
    const { rows } = await query<{ id: string }>(sql`/* updateTopicHostnameId:promotePublic */
        UPDATE url_hostnames
        SET publicly_introduced_at = COALESCE(publicly_introduced_at, CURRENT_TIMESTAMP)
        WHERE id = ${hostnameId}::uuid AND publicly_introduced_at IS NULL
        RETURNING id`)
    if (rows.length > 0) {
      const hostnameIds = rows.map(row => row.id)
      await enqueueHostnameCacheInvalidation(query, hostnameIds)
      registerPostCommitAction(query, async () => {
        await drainHostnameCacheInvalidationWork({ hostnameIds })
      })
    }
  }
}
async function assignHostnameToTopic(
  topicId: string,
  hostnameId: string,
  options: QueryOptions = {},
): Promise<void> {
  await write(
    sql`/* assignHostnameToTopic */
      UPDATE url_hostnames
      SET topic_id = ${topicId}
      WHERE id = ${hostnameId}::uuid
    `,
    options,
  )
}
async function assertTopicHostnameLinkIsValid(
  topicId: string,
  hostnameId: string,
  options: QueryOptions = {},
): Promise<void> {
  assert(isUUID(topicId), 422, 'topic_id must be a valid UUID')
  assert(isUUID(hostnameId), 422, 'hostname_id must be a valid UUID')
  const row = await getTopicHostnameLinkValidation(topicId, hostnameId, options)
  assert(row?.topic_exists, 422, 'topic_id must reference an existing topic')
  assert(row?.hostname_exists, 422, 'hostname_id must reference an existing hostname')
  assert(
    row.hostname_topic_id === null || row.hostname_topic_id === topicId,
    409,
    'Hostname is already linked to another topic',
  )
}
/** Returns a UUID unchanged, upserts a hostname string, or preserves null. */
export async function resolveHostname(
  userId: string,
  hostname: string | null,
  options: QueryOptions = {},
): Promise<string | null> {
  assert(
    hostname === null || typeof hostname === 'string',
    422,
    'hostname must be a string or null',
  )
  if (hostname === null) return null
  if (isUUID(hostname)) return hostname
  const normalized = normalizeHostname(hostname)
  assert(normalized !== null, 422, 'Invalid hostname format')
  const hostnameMap = await upsertUrlHostnames(userId, [normalized!], options)
  return hostnameMap.values().next().value ?? null
}
/**
 * RSS feed links set topics.hostname_id, not domain ownership in url_hostnames.topic_id.
 * Clear only a legacy claim on the previous primary hostname when a feed URL moves.
 */
export async function linkHostnameToSourceTopic(
  topicId: string,
  hostnameId: string,
  options: QueryOptions = {},
): Promise<void> {
  return withTopicHostnameTransaction(options, async query => {
    await clearOtherHostnameLinks(topicId, hostnameId, { query })
    await updateTopicHostnameId(topicId, hostnameId, query)
  })
}

export async function assertTopicHasHostname(
  topicId: string,
  options: QueryOptions = {},
): Promise<void> {
  assert(isUUID(topicId), 422, 'topic_id must be a valid UUID')
  const { rows } = await read<{ hostname_id: string | null }>(
    `/* assertTopicHasHostname */
    -- no-mistakes-disable-next-line postgres-required-predicates: exact write target validation must reject merged topic IDs.
    SELECT hostname_id
    FROM topics
    WHERE id = $1::uuid
      AND deleted_at IS NULL
      AND merged_into_topic_id IS NULL`,
    [topicId],
    options,
  )
  const topic = rows[0]
  assert(topic, 422, 'Topic not found')
  assert(topic.hostname_id, 422, 'RSS feed topic must be linked to a hostname')
}

export async function setTopicHostnameLink(
  topicId: string,
  hostnameId: string | null,
  options: QueryOptions = {},
): Promise<void> {
  return withTopicHostnameTransaction(options, async query => {
    const transaction = { query }
    if (hostnameId) await assertTopicHostnameLinkIsValid(topicId, hostnameId, transaction)
    await clearOtherHostnameLinks(topicId, hostnameId, transaction)
    await updateTopicHostnameId(topicId, hostnameId, query)
    if (hostnameId) await assignHostnameToTopic(topicId, hostnameId, transaction)
  })
}

async function withTopicHostnameTransaction(
  options: QueryOptions,
  run: (query: TransactionQuery) => Promise<void>,
): Promise<void> {
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  await run(transaction)
  await transaction.commit()
}
