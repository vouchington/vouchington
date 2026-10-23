import type { TransactionQuery } from '@data-stores/psql'
import {
  lockHostnameOwnership,
  lockTopicHostnameMutations,
} from '@services/urls-hostnames/ownership-lock'
import { lockTopicMergeLifecycles } from './merge-preflight.mts'
import sql from 'sql-template-strings'

/** Merge owns both topic identities before discovering every claim it moves or revives. */
export async function lockTopicMergeHostnameOwnership(
  query: TransactionQuery,
  topicIds: readonly string[],
): Promise<void> {
  // ast-grep-ignore: no-three-sequential-awaits -- topic ownership precedes the merge fence; both stabilize hostname discovery before publication locks.
  await lockTopicHostnameMutations(query, topicIds)
  await lockTopicMergeLifecycles(query, topicIds)
  // no-mistakes-disable-next-line postgres-required-predicates: merge repoints retained claims and can revive a deleted destination landing-page relation.
  const { rows } = await query<{
    hostname_id: string | null
  }>(sql`/* getTopicMergeHostnameOwnershipIds */
    SELECT hostname_id FROM topics WHERE id = ANY(${[...new Set(topicIds)]}::uuid[])
    UNION
    SELECT id FROM url_hostnames WHERE topic_id = ANY(${[...new Set(topicIds)]}::uuid[])
    UNION
    SELECT urls.hostname_id FROM relation__topic__landing_page__url relation
    JOIN urls ON urls.id = relation.object_id
    WHERE relation.subject_id = ANY(${[...new Set(topicIds)]}::uuid[])
  `)
  await lockHostnameOwnership(
    query,
    rows.flatMap(row => (row.hostname_id ? [row.hostname_id] : [])),
  )
}
