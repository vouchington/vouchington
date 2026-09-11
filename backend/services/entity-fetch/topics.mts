import type { PrivateUser } from '@services/users/types'
import type { TopicFetchResult } from './types.mts'
import { getTopicByAnyCachedBatch, getTopicMetricsByAnyCachedBatch } from './get.mts'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { indexById } from '@modules/utils'

export async function fetchTopicsWithMetadata(
  topicIds: string[],
  currentUser?: PrivateUser | null,
): Promise<TopicFetchResult> {
  if (topicIds.length === 0) {
    return {
      entities: {},
      entity_metrics: {},
    }
  }

  const [topics, topicMetrics, bookmarks] = await Promise.all([
    getTopicByAnyCachedBatch(topicIds),
    getTopicMetricsByAnyCachedBatch(topicIds),
    currentUser ? getBookmarksForEntities(currentUser, 'topic', topicIds) : Promise.resolve(),
  ])

  return {
    entities: indexById(topics),
    entity_metrics: indexById(topicMetrics),
    ...(bookmarks && Object.keys(bookmarks).length > 0 && { bookmarks }),
  }
}
