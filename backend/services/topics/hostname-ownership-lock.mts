import type { TransactionQuery } from '@data-stores/psql'
import {
  lockHostnameOwnership,
  lockTopicHostnameMutations,
} from '@services/urls-hostnames/ownership-lock'
import sql from 'sql-template-strings'

/** The topic lock keeps this read valid until all old and new hostname locks are held. */
export async function lockTopicHostnameOwnership(
  query: TransactionQuery,
  topicIds: readonly string[],
  nextHostnameIds: readonly string[],
): Promise<void> {
  await lockTopicHostnameMutations(query, topicIds)
  // no-mistakes-disable-next-line postgres-required-predicates: exact write targets include retained primary links on deleted topics.
  const { rows } = await query<{
    hostname_id: string | null
  }>(sql`/* getTopicHostnameOwnershipIds */
    SELECT hostname_id FROM topics WHERE id = ANY(${[...new Set(topicIds)]}::uuid[])
  `)
  await lockHostnameOwnership(query, [
    ...nextHostnameIds,
    ...rows.flatMap(row => (row.hostname_id ? [row.hostname_id] : [])),
  ])
}
