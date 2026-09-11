import type { QueryOptions } from '@data-stores/psql/types'
import { computePostChanges, createPostRevision } from '@services/post-revisions'
import type { TopicRecommendationPost } from './types.mts'

/** Records the durable entity-listener reconciliation source for a created recommendation. */
export async function recordTopicRecommendationCreateRevision(
  post: TopicRecommendationPost,
  actorUserId: string,
  options: QueryOptions,
): Promise<void> {
  await createPostRevision(post.id, 'create', computePostChanges(null, post), actorUserId, options)
}
