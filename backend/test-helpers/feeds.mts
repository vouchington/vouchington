import type { PrivateUser } from '@voucha/types/entities/user'

type FollowTopicsFeedResult = {
  results: ReadonlyArray<{ entity_id: string }>
}

type ReadFollowTopicsFeed = (
  currentUser: PrivateUser,
  options: { feed_type: 'follow_topics'; limit: number },
) => Promise<FollowTopicsFeedResult>

/**
 * Read the follow-topics feed once after the caller has committed the post relation.
 * A miss fails immediately; the read is not retried.
 */
export async function readCommittedFollowTopicsFeedPost(
  currentUser: PrivateUser,
  postId: string,
  readFollowTopicsFeed: ReadFollowTopicsFeed,
  options: { limit?: number } = {},
): Promise<void> {
  const { limit = 100 } = options
  const result = await readFollowTopicsFeed(currentUser, {
    feed_type: 'follow_topics',
    limit,
  })
  if (result.results.some(row => row.entity_id === postId)) return
  throw new Error(`Post ${postId} was not in the follow-topics feed after commit`)
}
