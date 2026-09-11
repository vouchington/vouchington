import type { PrivateUser } from '@voucha/types/entities/user'

type FollowTopicsFeedResult = {
  results: ReadonlyArray<{ entity_id: string }>
}

type ReadFollowTopicsFeed = (
  currentUser: PrivateUser,
  options: { feed_type: 'follow_topics'; limit: number },
) => Promise<FollowTopicsFeedResult>

/** Wait until an uncached follow-topics feed read includes a test-owned post. */
export async function waitForFollowTopicsFeedPost(
  currentUser: PrivateUser,
  postId: string,
  readFollowTopicsFeed: ReadFollowTopicsFeed,
  options: { limit?: number; timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const { limit = 100, timeoutMs = 10_000, intervalMs = 100 } = options
  const deadline = Date.now() + timeoutMs

  for (;;) {
    const result = await readFollowTopicsFeed(currentUser, {
      feed_type: 'follow_topics',
      limit,
    })
    if (result.results.some(row => row.entity_id === postId)) return
    if (Date.now() >= deadline) break
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }

  throw new Error(`Timed out waiting for post ${postId} in the follow-topics feed`)
}
