import { enqueueBulkTopicAliasesUpdate } from '@queues/topic-aliases/enqueues'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { invalidate } from '@services/entity-cache/invalidate'
import { normalizeKey } from '@ts-shared/utils/strings'
import type { TopicAlias } from './alias-types.mts'
import { invalidatePostsForTopicAliases } from './invalidate-posts-for-topic-aliases.mts'

export async function finalizeClaimedTopicAliases(
  topicId: string,
  claimedAliases: TopicAlias[],
): Promise<void> {
  if (claimedAliases.length === 0) return

  const aliases = claimedAliases.map(alias => alias.alias)
  entityCacheBloomFilters.topics.add(aliases.map(normalizeKey))
  await Promise.all([
    invalidate.topics(topicId, aliases),
    invalidate.topic_metrics(topicId),
    invalidatePostsForTopicAliases(claimedAliases.map(alias => alias.id)),
  ])
  void enqueueBulkTopicAliasesUpdate([topicId])
}
