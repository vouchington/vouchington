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
    -- no-mistakes-disable-next-line postgres-bounded-statements: topic mutation must lock every hostname currently owned by its topic IDs before changing ownership; per-topic hostname ownership has no cardinality cap.
    SELECT id FROM url_hostnames WHERE topic_id = ANY(${[...new Set(topicIds)]}::uuid[])
    UNION
    -- no-mistakes-disable-next-line postgres-bounded-statements: topic mutation must lock the hostnames of every live landing-page relation for its topic IDs; omitting a relation leaves an ownership race, and relation count is uncapped.
    SELECT urls.hostname_id FROM relation__topic__landing_page__url relation
    -- no-mistakes-disable-next-line postgres-bounded-statements: the URL primary-key join adds at most one hostname per live landing-page relation; every relation must contribute its ownership lock.
    JOIN urls ON urls.id = relation.object_id
    WHERE relation.subject_id = ANY(${[...new Set(topicIds)]}::uuid[])
      AND relation.deleted_at IS NULL
  `)
  await lockHostnameOwnership(query, [
    ...nextHostnameIds,
    ...rows.flatMap(row => (row.hostname_id ? [row.hostname_id] : [])),
  ])
}
