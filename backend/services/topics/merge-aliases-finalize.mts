import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { invalidate } from '@services/entity-cache/invalidate'
import { enqueueOnTopicUpdated } from '@queues/entity-listeners/enqueues'
import { enqueueBulkTopicAliasesUpdate } from '@queues/topic-aliases/enqueues'
import { normalizeKey } from '@ts-shared/utils/strings'
import assert from 'http-assert'
import { getTopicByAny } from './get.mts'
import { invalidatePostsForTopicAliases } from './invalidate-posts-for-topic-aliases.mts'
import type { Topic } from './types.mts'
import type { PrivateUser } from '@services/users/types'

export async function finalizeTopicAliasMerge(input: {
  merger: PrivateUser
  sourceTopic: Topic
  destinationTopic: Topic
  movedAliases: string[]
  movedAliasIds: string[]
}) {
  const { merger, sourceTopic, destinationTopic, movedAliases, movedAliasIds } = input
  entityCacheBloomFilters.topics.add(movedAliases.map(normalizeKey))
  await Promise.all([
    invalidate.topics(
      sourceTopic.id,
      sourceTopic.slug,
      destinationTopic.id,
      destinationTopic.slug,
      movedAliases,
    ),
    invalidate.topic_metrics(sourceTopic.id, destinationTopic.id),
    invalidatePostsForTopicAliases(movedAliasIds),
  ])
  void enqueueBulkTopicAliasesUpdate([sourceTopic.id, destinationTopic.id])
  void enqueueOnTopicUpdated(sourceTopic.id, merger.id)
  void enqueueOnTopicUpdated(destinationTopic.id, merger.id)
  const refreshedDestinationTopic = await getTopicByAny(destinationTopic.id)
  assert(refreshedDestinationTopic, 500, 'Merged destination topic not found')
  return refreshedDestinationTopic
}
