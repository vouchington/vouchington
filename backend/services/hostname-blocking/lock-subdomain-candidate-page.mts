import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { HostnameBlockCleanupOperation } from './cleanup-operation.mts'

export type HostnameCandidate = { id: string; reversed_hostname: string; page_after: string }

export async function lockHostnameBlockSubdomainCandidatePage(
  query: TransactionQuery,
  operation: HostnameBlockCleanupOperation,
  afterReversedHostname: string | undefined,
  limit: number,
): Promise<HostnameCandidate[]> {
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
    )
    SELECT child.id, child.reversed_hostname,
      (SELECT page.reversed_hostname FROM candidate_page page
        ORDER BY page.reversed_hostname COLLATE "C" DESC, page.id DESC LIMIT 1) AS page_after
    FROM url_hostnames child
    JOIN candidate_page page ON page.id = child.id
    ORDER BY child.id
    FOR NO KEY UPDATE OF child
  `)
  return (await query<HostnameCandidate>(statement)).rows
}
