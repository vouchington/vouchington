import { enqueueBulkEvaluateRssFeedDiscoverability } from '@queues/rss-feed-discoverability/enqueues'
import { findRssFeedIdsByTopicIds } from './rss-feed-ids-by-topic-ids.mts'
import type { EntityRelationMetadata } from './metadata.mts'
import type { EntityRelation } from './upsert-helpers.mts'

export async function enqueueRssFeedDiscoverabilityForPublisherTypeRelations(
  relation: EntityRelationMetadata,
  relations: EntityRelation[],
): Promise<void> {
  if (
    relation.subject_type !== 'topic' ||
    relation.predicate !== 'publisher_type' ||
    relation.object_type !== 'topic' ||
    relations.length === 0
  ) {
    return
  }

  const topicIds = [...new Set(relations.map(r => r.subject_id))]
  const rssFeedIds = await findRssFeedIdsByTopicIds(topicIds)
  void enqueueBulkEvaluateRssFeedDiscoverability(rssFeedIds)
}
