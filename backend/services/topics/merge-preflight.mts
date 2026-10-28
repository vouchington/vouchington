import type { Topic } from './types.mts'
import type { TransactionQuery } from '@data-stores/psql'
import { createCodedError } from '@vouchington/sentry'
import assert from 'http-assert'

type MergeRow = Pick<Topic, 'id' | 'slug' | 'topic_type'> &
  Record<'is_deleted' | 'is_merged', boolean>

/** Serialize identity assignment so admission_position orders committed reservations. */
export async function lockTopicMergeAdmission(query: TransactionQuery): Promise<void> {
  await query(
    `/* lockTopicMergeAdmission */
      SELECT pg_advisory_xact_lock(hashtextextended('topic-merge-admission', 0))`,
  )
}

/** Lock both participants before reservation and retain precise inactive-topic errors. */
export async function lockAndAssertMergeParticipants(
  query: TransactionQuery,
  sourceTopicId: string,
  destinationTopicId: string,
): Promise<MergeRow> {
  const { rows } = await query<MergeRow>(
    // no-mistakes-disable-next-line postgres-required-predicates: lifecycle output enables precise 404/409 assertions below
    `/* mergeTopicAliases lockTopics */ SELECT id, slug, topic_type, deleted_at IS NOT NULL AS is_deleted, merged_into_topic_id IS NOT NULL AS is_merged FROM topics WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [[sourceTopicId, destinationTopicId]],
  )
  const sourceRow = rows.find(row => row.id === sourceTopicId)
  const destinationRow = rows.find(row => row.id === destinationTopicId)
  assert(sourceRow && !sourceRow.is_deleted, 404, 'Source topic not found')
  assert(destinationRow && !destinationRow.is_deleted, 404, 'Destination topic not found')
  assert(!sourceRow.is_merged, 409, 'Source topic has already been merged')
  assert(!destinationRow.is_merged, 409, 'Destination topic has already been merged')
  assertLockedTopicMergeTypes(sourceRow, destinationRow)
  return sourceRow
}

export async function lockTopicMergeLifecycles(
  query: TransactionQuery,
  topicIds: readonly string[],
): Promise<void> {
  await query(
    `/* lockTopicMergeLifecycles */
      SELECT pg_advisory_xact_lock(hashtextextended('topic-merge-lifecycle:' || id::text, 0))
      FROM (SELECT DISTINCT unnest($1::uuid[]) AS id ORDER BY id) ordered_ids`,
    [topicIds],
  )
}

/** updateTopic does not take the merge fence; validate the current locked rows as well. */
export function assertLockedTopicMergeTypes(
  source: Pick<Topic, 'id' | 'topic_type'>,
  destination: Pick<Topic, 'id' | 'topic_type'>,
): void {
  if (source.topic_type === destination.topic_type) return
  throw Object.assign(
    createCodedError(
      409,
      'Cannot merge topics with conflicting topic types',
      'topic_merge_type_conflict',
    ),
    { source_id: source.id, destination_id: destination.id },
  )
}
