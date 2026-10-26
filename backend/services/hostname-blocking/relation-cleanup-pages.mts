import type { TransactionQuery } from '@data-stores/psql/types'
import type {
  HostnameBlockCleanupCursor,
  HostnameBlockCleanupHostname,
} from '@queues/background/enqueues/hostname-blocking-jobs'
import sql from 'sql-template-strings'
import type { HostnameBlockCleanupOperation } from './cleanup-operation.mts'

export async function getHostnameCleanupPage(
  query: TransactionQuery,
  operation: HostnameBlockCleanupOperation,
  afterReversedHostname: string | undefined,
  limit: number,
): Promise<HostnameBlockCleanupHostname[]> {
  const reversedRoot = operation.hostname.split('.').toReversed().join('.')
  const statement = sql`/* getHostnameCleanupPage */
    SELECT hostname.id, hostname.reversed_hostname AS "reversedHostname",
      EXISTS (
        SELECT 1 FROM url_hostname_blocks owner
        WHERE owner.url_hostname_id = hostname.id
          AND owner.relation_cleanup_root_block_id = ${operation.blockId}
      ) AS owned
    FROM url_hostnames hostname
    WHERE hostname.reversed_hostname COLLATE "C" >= ${reversedRoot}
      AND hostname.reversed_hostname COLLATE "C" < ${`${reversedRoot}/`}`
  if (afterReversedHostname) {
    statement.append(sql` AND hostname.reversed_hostname COLLATE "C" > ${afterReversedHostname}`)
  }
  statement.append(sql`
    ORDER BY hostname.reversed_hostname COLLATE "C", hostname.id
    LIMIT ${limit}
  `)
  const { rows } = await query<HostnameBlockCleanupHostname>(statement)
  return rows
}

export async function getHostnameUrlPage(
  query: TransactionQuery,
  hostnameId: string,
  afterId: string | undefined,
  limit: number,
): Promise<string[]> {
  const statement = sql`/* getHostnameUrlPage */
    SELECT id FROM urls WHERE hostname_id = ${hostnameId}`
  if (afterId) statement.append(sql` AND id > ${afterId}`)
  statement.append(sql` ORDER BY id LIMIT ${limit}`)
  const { rows } = await query<{ id: string }>(statement)
  return rows.map(row => row.id)
}

export function advancePastHostname(
  cursor: Extract<HostnameBlockCleanupCursor, { stage: 'relations' }>,
): HostnameBlockCleanupCursor {
  const hostnames = cursor.hostnames!
  const hostnameIndex = cursor.hostnameIndex ?? 0
  if (hostnameIndex + 1 < hostnames.length) {
    return {
      stage: 'relations',
      ...(cursor.afterReversedHostname
        ? { afterReversedHostname: cursor.afterReversedHostname }
        : {}),
      hostnames,
      hostnameIndex: hostnameIndex + 1,
      ...(cursor.hostnamesExhausted === undefined
        ? {}
        : { hostnamesExhausted: cursor.hostnamesExhausted }),
    }
  }
  const afterReversedHostname = hostnames.at(-1)!.reversedHostname
  return cursor.hostnamesExhausted
    ? { stage: 'penalties' }
    : { stage: 'relations', afterReversedHostname }
}

export function advancePastUrlPage(
  cursor: Extract<HostnameBlockCleanupCursor, { stage: 'relations' }>,
): HostnameBlockCleanupCursor {
  if (cursor.urlsExhausted) return advancePastHostname(cursor)
  return {
    stage: 'relations',
    ...(cursor.afterReversedHostname
      ? { afterReversedHostname: cursor.afterReversedHostname }
      : {}),
    ...(cursor.hostnames ? { hostnames: cursor.hostnames } : {}),
    ...(cursor.hostnameIndex === undefined ? {} : { hostnameIndex: cursor.hostnameIndex }),
    ...(cursor.hostnamesExhausted === undefined
      ? {}
      : { hostnamesExhausted: cursor.hostnamesExhausted }),
    urlAfterId: cursor.urlIds!.at(-1)!,
  }
}
