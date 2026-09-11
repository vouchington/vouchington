import { describe, expect, it, vi } from 'vitest'
import { waitForFollowTopicsFeedPost } from './feeds.mts'

const user = { id: 'test-user' } as Parameters<typeof waitForFollowTopicsFeedPost>[0]
type ReadFollowTopicsFeed = Parameters<typeof waitForFollowTopicsFeedPost>[2]

describe('waitForFollowTopicsFeedPost', () => {
  it('polls until the requested post appears', async () => {
    const readFollowTopicsFeed = vi
      .fn<ReadFollowTopicsFeed>()
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ results: [{ entity_id: 'post-id' }] })

    await waitForFollowTopicsFeedPost(user, 'post-id', readFollowTopicsFeed, {
      intervalMs: 0,
    })

    expect(readFollowTopicsFeed).toHaveBeenCalledTimes(2)
    expect(readFollowTopicsFeed).toHaveBeenLastCalledWith(user, {
      feed_type: 'follow_topics',
      limit: 100,
    })
  })

  it('fails with the missing post id after the timeout', async () => {
    const readFollowTopicsFeed = vi.fn<ReadFollowTopicsFeed>().mockResolvedValue({ results: [] })

    await expect(
      waitForFollowTopicsFeedPost(user, 'missing-post', readFollowTopicsFeed, {
        timeoutMs: 0,
      }),
    ).rejects.toThrow('Timed out waiting for post missing-post in the follow-topics feed')
  })
})
