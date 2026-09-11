import { enqueueBulkEvaluateRssFeedDiscoverability } from '@queues/rss-feed-discoverability/enqueues'
import type { EntityRelationMetadata } from './metadata.mts'
import { findRssFeedIdsByTopicIds } from './rss-feed-ids-by-topic-ids.mts'
import type { EntityIdentifier, UpsertEntityTypes } from './upsert-helpers.mts'

export async function enqueueRssFeedDiscoverabilityForDeletedPublisherTypeRelations(
  relation: EntityRelationMetadata,
  subjects: Array<UpsertEntityTypes | EntityIdentifier>,
): Promise<void> {
  if (
    relation.subject_type !== 'topic' ||
    relation.predicate !== 'publisher_type' ||
    relation.object_type !== 'topic' ||
    subjects.length === 0
  ) {
    return
  }
  const topicIds = [...new Set(subjects.map(subject => subject.id))]
  const rssFeedIds = await findRssFeedIdsByTopicIds(topicIds)
  /* c8 ignore next -- lint-only fire-and-forget enqueue disposition. */
  void enqueueBulkEvaluateRssFeedDiscoverability(rssFeedIds)
}
