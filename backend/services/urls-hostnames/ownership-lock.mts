import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

const hostnameIdsLockedInQuery = new WeakMap<TransactionQuery, Set<string>>()

/** Serializes ownership writers using the same ID key as hostname blocking. */
export async function lockHostnameOwnership(
  query: TransactionQuery,
  hostnameIds: readonly string[],
): Promise<void> {
  const held = hostnameIdsLockedInQuery.get(query) ?? new Set<string>()
  const ids = [...new Set(hostnameIds.map(id => id.toLowerCase()))]
    .toSorted()
    .filter(id => !held.has(id))
  if (ids.length === 0) return
  const { rows } = await query<{ hostname_id: string }>(sql`/* lockHostnameOwnership */
    WITH RECURSIVE hostname_names(hostname) AS (
      SELECT hostname FROM url_hostnames WHERE id = ANY(${ids}::uuid[])
      UNION
      SELECT substring(hostname FROM position('.' IN hostname) + 1)
      FROM hostname_names WHERE position('.' IN hostname) > 0
    ), candidate_ids AS (
      SELECT id AS hostname_id FROM url_hostnames
      WHERE hostname IN (SELECT hostname FROM hostname_names)
      UNION
      SELECT unnest(${ids}::uuid[])
    )
    SELECT pg_advisory_xact_lock(hashtextextended(ordered.hostname_id::text, 0))
      , ordered.hostname_id
    FROM (
      SELECT hostname_id FROM candidate_ids
      WHERE hostname_id <> ALL(${[...held]}::uuid[])
      ORDER BY hostname_id
    ) ordered
  `)
  for (const row of rows) held.add(row.hostname_id)
  hostnameIdsLockedInQuery.set(query, held)
}

/** Locks the hostnames of URL rows already visible in this transaction. */
export async function lockHostnameOwnershipForUrls(
  query: TransactionQuery,
  urlIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(urlIds)]
  if (ids.length === 0) return
  const { rows } = await query<{ hostname_id: string }>(sql`/* getUrlHostnameOwnershipIds */
    SELECT DISTINCT hostname_id FROM urls WHERE id = ANY(${ids}::uuid[])
  `)
  await lockHostnameOwnership(
    query,
    rows.map(row => row.hostname_id),
  )
}

const topicIdsLockedInQuery = new WeakMap<TransactionQuery, Set<string>>()

/** A topic inserted in this transaction is invisible to competing ownership writers. */
export function registerCreatedTopicsForHostnameOwnership(
  query: TransactionQuery,
  topicIds: readonly string[],
): void {
  const held = topicIdsLockedInQuery.get(query) ?? new Set<string>()
  for (const id of topicIds) held.add(id.toLowerCase())
  topicIdsLockedInQuery.set(query, held)
}

/** Stabilize current-hostname discovery before acquiring any hostname or publication locks. */
export async function lockTopicHostnameMutations(
  query: TransactionQuery,
  topicIds: readonly string[],
): Promise<void> {
  const held = topicIdsLockedInQuery.get(query) ?? new Set<string>()
  const ids = [...new Set(topicIds.map(id => id.toLowerCase()))]
    .toSorted()
    .filter(id => !held.has(id))
  if (ids.length === 0) return
  await query(sql`/* lockTopicHostnameMutations */
    SELECT pg_advisory_xact_lock(hashtextextended('topic-hostname:' || topic_id::text, 0))
    FROM unnest(${ids}::uuid[]) AS input(topic_id)
    ORDER BY topic_id
  `)
  for (const id of ids) held.add(id)
  topicIdsLockedInQuery.set(query, held)
}
