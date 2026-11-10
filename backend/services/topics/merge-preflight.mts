import type { Topic } from './types.mts'
import type { TransactionQuery } from '@data-stores/psql'
import { createCodedError } from '@vouchington/sentry'
import assert from 'http-assert'

type MergeRow = Pick<Topic, 'id' | 'slug' | 'topic_type'> &
  Record<'is_deleted' | 'is_merged' | 'has_pending_slug_alias', boolean>

/** Retained call site. Merge admission no longer takes a lock. */
export async function lockTopicMergeAdmission(_query: TransactionQuery): Promise<void> {}

/** Lock both participants before reservation and retain precise inactive-topic errors. */
export async function lockAndAssertMergeParticipants(
  query: TransactionQuery,
  sourceTopicId: string,
  destinationTopicId: string,
): Promise<MergeRow> {
  const { rows } = await query<MergeRow>(
    // no-mistakes-disable-next-line postgres-required-predicates: lifecycle output enables precise 404/409 assertions below
    `/* mergeTopicAliases lockTopics */ SELECT id, slug, topic_type, deleted_at IS NOT NULL AS is_deleted, merged_into_topic_id IS NOT NULL AS is_merged, EXISTS (SELECT 1 FROM topic_aliases WHERE alias = topics.slug AND unlink_requested_at IS NOT NULL) AS has_pending_slug_alias FROM topics WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [[sourceTopicId, destinationTopicId]],
  )
  const sourceRow = rows.find(row => row.id === sourceTopicId)
  const destinationRow = rows.find(row => row.id === destinationTopicId)
  assert(sourceRow && !sourceRow.is_deleted, 404, 'Source topic not found')
  assert(destinationRow && !destinationRow.is_deleted, 404, 'Destination topic not found')
  assert(!sourceRow.is_merged, 409, 'Source topic has already been merged')
  assert(!destinationRow.is_merged, 409, 'Destination topic has already been merged')
  // A pending unlink owns its slug until bounded deletion finishes; a merge must not relink it.
  assert(!sourceRow.has_pending_slug_alias, 409, 'Topic alias unlink is in progress')
  assertLockedTopicMergeTypes(sourceRow, destinationRow)
  return sourceRow
}

/** Retained call site. Merge lifecycles no longer take a lock. */
export async function lockTopicMergeLifecycles(
  _query: TransactionQuery,
  _topicIds: readonly string[],
): Promise<void> {}

/** Reject an active merge without locking the topic read context. */
export async function assertNoActiveTopicMerges(
  query: TransactionQuery,
  topicIds: readonly string[],
): Promise<void> {
  if (topicIds.length === 0) return
  const { rows } = await query<{ id: string }>(
    `/* assertNoActiveTopicMerges */
     SELECT id FROM topic_merge_operations
     WHERE completed_at IS NULL AND failed_at IS NULL
       AND (source_topic_id = ANY($1::uuid[]) OR destination_topic_id = ANY($1::uuid[]))
     LIMIT 1`,
    [topicIds],
  )
  assert(rows.length === 0, 409, 'Topic merge is still in progress; retry category page')
}

/** updateTopic does not take the merge fence; validate the current locked rows as well. */
function assertLockedTopicMergeTypes(
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
