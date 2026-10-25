import type { TransactionQuery } from '@data-stores/psql'
import { createTransactionLockOnce } from '@vouchington/postgres'
import sql from 'sql-template-strings'

// Hostname ownership hashes bare UUIDs; the custom acquisition preserves that key.
const hostnameOwnershipLocks = createTransactionLockOnce({
  namespace: '',
  annotation: 'lockHostnameOwnership',
  async acquire(query, sortedIds) {
    const { rows } = await query<{ hostname_id: string }>(sql`/* lockHostnameOwnership */
      WITH RECURSIVE hostname_names(hostname) AS (
        SELECT hostname FROM url_hostnames WHERE id = ANY(${sortedIds}::uuid[])
        UNION
        SELECT substring(hostname FROM position('.' IN hostname) + 1)
        FROM hostname_names WHERE position('.' IN hostname) > 0
      ), candidate_ids AS (
        SELECT id AS hostname_id FROM url_hostnames
        WHERE hostname IN (SELECT hostname FROM hostname_names)
        UNION
        SELECT unnest(${sortedIds}::uuid[])
      )
      SELECT pg_advisory_xact_lock(hashtextextended(ordered.hostname_id::text, 0))
        , ordered.hostname_id
      FROM (
        SELECT hostname_id FROM candidate_ids
        ORDER BY hostname_id
      ) ordered
    `)
    return rows.map(row => row.hostname_id)
  },
})

/** Serializes ownership writers using the same ID key as hostname blocking. */
export async function lockHostnameOwnership(
  query: TransactionQuery,
  hostnameIds: readonly string[],
): Promise<void> {
  await hostnameOwnershipLocks.lock(query, hostnameIds)
}

/** Locks the hostnames of URL rows already visible in this transaction. */
export async function lockHostnameOwnershipForUrls(
  query: TransactionQuery,
  urlIds: readonly string[],
): Promise<string[]> {
  const ids = [...new Set(urlIds)]
  if (ids.length === 0) return []
  const { rows } = await query<{
    hostname_id: string
    hostname: string
  }>(sql`/* getUrlHostnameOwnershipIds */
    SELECT DISTINCT urls.hostname_id, hostname.hostname FROM urls
    JOIN url_hostnames hostname ON hostname.id = urls.hostname_id
    WHERE urls.id = ANY(${ids}::uuid[])
  `)
  await lockHostnameOwnership(
    query,
    rows.map(row => row.hostname_id),
  )
  return rows.map(row => row.hostname)
}

const topicHostnameMutationLocks = createTransactionLockOnce({
  namespace: 'topic-hostname:',
  annotation: 'lockTopicHostnameMutations',
})

/** A topic inserted in this transaction is invisible to competing ownership writers. */
export function registerCreatedTopicsForHostnameOwnership(
  query: TransactionQuery,
  topicIds: readonly string[],
): void {
  topicHostnameMutationLocks.markHeld(query, topicIds)
}

/** Stabilize current-hostname discovery before acquiring any hostname or publication locks. */
export async function lockTopicHostnameMutations(
  query: TransactionQuery,
  topicIds: readonly string[],
): Promise<void> {
  await topicHostnameMutationLocks.lock(query, topicIds)
}
