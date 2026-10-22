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
    UNION
    SELECT id FROM url_hostnames WHERE topic_id = ANY(${[...new Set(topicIds)]}::uuid[])
    UNION
    SELECT urls.hostname_id FROM relation__topic__landing_page__url relation
    JOIN urls ON urls.id = relation.object_id
    WHERE relation.subject_id = ANY(${[...new Set(topicIds)]}::uuid[])
      AND relation.deleted_at IS NULL
  `)
  await lockHostnameOwnership(query, [
    ...nextHostnameIds,
    ...rows.flatMap(row => (row.hostname_id ? [row.hostname_id] : [])),
  ])
}
