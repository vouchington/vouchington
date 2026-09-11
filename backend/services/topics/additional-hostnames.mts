import { read, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import { normalizeHostname } from '@ts-shared/utils/urls'
import { invalidate } from '@services/entity-cache'
import { upsertUrlHostnames } from '@services/urls-hostnames'
import assert from 'http-assert'
import sql from 'sql-template-strings'

export type TopicAdditionalHostname = {
  hostname_id: string
  hostname: string
  topic_id: string
  created_at: Date
}

export const getAdditionalHostnames = async (
  topicId: string,
  options: { limit?: number; after?: { id: string } } = {},
): Promise<{ results: TopicAdditionalHostname[]; hasNextPage: boolean }> => {
  assert(isUUID(topicId), 422, 'topic_id must be a valid UUID')
  const limit = Math.max(1, Math.min(100, options.limit ?? 25))
  // no-mistakes-disable-next-line postgres-required-predicates: id-scoped hostname_id lookup of the already-validated topic
  const query = sql`/* getAdditionalHostnames */ SELECT uh.id AS hostname_id, uh.hostname, ${topicId}::uuid AS topic_id, uh.created_at FROM url_hostnames uh WHERE uh.topic_id = ${topicId} AND uh.id IS DISTINCT FROM (SELECT hostname_id FROM topics WHERE id = ${topicId})`
  if (options.after) {
    query.append(sql` AND uh.id > ${options.after.id}`)
  }
  query.append(sql` ORDER BY uh.id ASC LIMIT ${limit + 1}`)
  const { rows } = await read(query)
  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit) as TopicAdditionalHostname[]
  return { results, hasNextPage }
}

export const addAdditionalHostname = async (
  topicId: string,
  hostname: string,
  userId: string,
  options: QueryOptions = {},
): Promise<TopicAdditionalHostname> => {
  assert(isUUID(topicId), 422, 'topic_id must be a valid UUID')
  assert(hostname && typeof hostname === 'string', 422, 'hostname is required')
  const normalizedHostname = normalizeHostname(hostname)
  assert(normalizedHostname !== null, 422, 'Invalid hostname format')

  const hostnameMap = await upsertUrlHostnames(userId, [normalizedHostname!], options)
  const hostnameId = hostnameMap.values().next().value as string | undefined
  assert(hostnameId, 500, 'Failed to resolve hostname')

  // Conflict check, update, and hostname fetch in one query.
  // The UPDATE only runs if the hostname is not the topic's own primary, not the primary
  // for another topic, and not already claimed by a different topic.
  // no-mistakes-disable-next-line postgres-required-predicates: is_own_primary is an id-scoped lookup of the already-validated topic
  const { rows } = await write(
    sql`/* addAdditionalHostname */ WITH is_own_primary AS (SELECT 1 FROM topics WHERE id = ${topicId} AND hostname_id = ${hostnameId} LIMIT 1), conflict_topic AS (SELECT id FROM topics WHERE hostname_id = ${hostnameId} AND id <> ${topicId} AND deleted_at IS NULL AND merged_into_topic_id IS NULL LIMIT 1), upd AS (UPDATE url_hostnames SET topic_id = ${topicId} WHERE id = ${hostnameId} AND NOT EXISTS (SELECT 1 FROM is_own_primary) AND NOT EXISTS (SELECT 1 FROM conflict_topic) AND (topic_id IS NULL OR topic_id = ${topicId} OR NOT EXISTS (SELECT 1 FROM topics WHERE topics.id = url_hostnames.topic_id AND topics.deleted_at IS NULL AND topics.merged_into_topic_id IS NULL)) RETURNING id) SELECT uh.hostname, uh.created_at, EXISTS (SELECT 1 FROM is_own_primary) AS is_own_primary, EXISTS (SELECT 1 FROM conflict_topic) AS is_primary_for_other, EXISTS (SELECT 1 FROM upd) AS updated FROM url_hostnames uh WHERE uh.id = ${hostnameId}`,
    options,
  )

  const row = rows[0] as
    | {
        hostname: string
        created_at: Date
        is_own_primary: boolean
        is_primary_for_other: boolean
        updated: boolean
      }
    | undefined
  assert(row, 500, 'Failed to resolve hostname record')
  assert(!row.is_own_primary, 409, 'Hostname is already the primary hostname for this topic')
  assert(
    !row.is_primary_for_other,
    409,
    'Hostname is already the primary hostname for another topic',
  )
  assert(row.updated, 409, 'Hostname is already linked to another topic')

  await invalidate.url_hostnames(hostnameId)

  return {
    hostname_id: hostnameId,
    hostname: row.hostname,
    topic_id: topicId,
    created_at: row.created_at,
  }
}

export const removeAdditionalHostname = async (
  topicId: string,
  hostnameId: string,
  options: QueryOptions = {},
): Promise<void> => {
  assert(isUUID(topicId), 422, 'topic_id must be a valid UUID')
  assert(isUUID(hostnameId), 422, 'hostname_id must be a valid UUID')

  // no-mistakes-disable-next-line postgres-required-predicates: id-scoped hostname_id lookup of the already-validated topic
  const { rows } = await write(
    sql`/* removeAdditionalHostname */ UPDATE url_hostnames SET topic_id = NULL WHERE id = ${hostnameId} AND topic_id = ${topicId} AND id IS DISTINCT FROM (SELECT hostname_id FROM topics WHERE id = ${topicId}) RETURNING id`,
    options,
  )
  assert(rows.length > 0, 404, 'Additional hostname not found for this topic')
  await invalidate.url_hostnames(hostnameId)
}
