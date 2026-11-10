import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Returns the hostnames of URL rows already visible in this transaction. */
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
  return rows.map(row => row.hostname)
}
