import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Serializes landing-page claims on a hostname. The key is the hostname text so a caller can
 * lock before the url row exists. Every insert of relation__topic__landing_page__url takes it.
 */
export async function lockHostnameOwnership(
  query: TransactionQuery,
  hostnames: readonly string[],
): Promise<void> {
  const keys = [
    ...new Set(hostnames.map(hostname => `hostname-ownership:${hostname.toLowerCase()}`)),
  ].toSorted()
  if (keys.length === 0) return
  await query(sql`/* lockHostnameOwnership */
    SELECT pg_advisory_xact_lock(hashtextextended(ordered.lock_key, 0))
    FROM (
      SELECT unnest(${keys}::text[]) AS lock_key
      ORDER BY lock_key
    ) ordered
  `)
}

/** Locks the hostnames of URL rows already visible in this transaction. */
export async function lockHostnameOwnershipForUrls(
  query: TransactionQuery,
  urlIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(urlIds)]
  if (ids.length === 0) return
  await query(sql`/* lockHostnameOwnership */
    SELECT pg_advisory_xact_lock(hashtextextended(ordered.lock_key, 0))
    FROM (
      SELECT DISTINCT 'hostname-ownership:' || lower(url_hostnames.hostname) AS lock_key
      FROM urls
      JOIN url_hostnames ON url_hostnames.id = urls.hostname_id
      WHERE urls.id = ANY(${ids}::uuid[])
      ORDER BY lock_key
    ) ordered
  `)
}
