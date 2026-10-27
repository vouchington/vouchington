import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { HostnameBlockCleanupOperation } from './cleanup-operation.mts'

export type HostnameCandidate = { id: string; reversed_hostname: string }

export type LockedSubdomainCandidatePage = {
  /** Rows of the page that were still present when locked. */
  candidates: HostnameCandidate[]
  /** Rows in the unlocked ordered page; a concurrent change never shortens it. */
  pageSize: number
  /** Keyset position of the last unlocked page row. */
  pageAfter: string | undefined
}

export async function lockHostnameBlockSubdomainCandidatePage(
  query: TransactionQuery,
  operation: HostnameBlockCleanupOperation,
  afterReversedHostname: string | undefined,
  limit: number,
): Promise<LockedSubdomainCandidatePage> {
  const reversedRoot = operation.hostname.split('.').toReversed().join('.')
  const statement = sql`/* lockHostnameBlockSubdomainCandidatePage */
    WITH candidate_page AS MATERIALIZED (
      SELECT child.id, child.reversed_hostname
      FROM url_hostnames child
      WHERE child.reversed_hostname COLLATE "C" >= ${`${reversedRoot}.`}
        AND child.reversed_hostname COLLATE "C" < ${`${reversedRoot}/`}`
  if (afterReversedHostname) {
    statement.append(sql` AND child.reversed_hostname COLLATE "C" > ${afterReversedHostname}`)
  }
  statement.append(sql`
      ORDER BY child.reversed_hostname COLLATE "C", child.id
      LIMIT ${limit}
    ), locked AS MATERIALIZED (
      SELECT child.id FROM url_hostnames child
      JOIN candidate_page page ON page.id = child.id
      ORDER BY child.id
      FOR NO KEY UPDATE OF child
    )
    SELECT page.id, page.reversed_hostname, locked.id IS NOT NULL AS locked
    FROM candidate_page page
    LEFT JOIN locked ON locked.id = page.id
    ORDER BY page.reversed_hostname COLLATE "C", page.id
  `)
  const { rows } = await query<HostnameCandidate & { locked: boolean }>(statement)
  return {
    candidates: rows.filter(row => row.locked),
    pageSize: rows.length,
    pageAfter: rows.at(-1)?.reversed_hostname,
  }
}
