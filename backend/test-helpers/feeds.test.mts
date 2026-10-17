import { describe, expect, it, vi } from 'vitest'
import { readCommittedFollowTopicsFeedPost } from './feeds.mts'

const user = { id: 'test-user' } as Parameters<typeof readCommittedFollowTopicsFeedPost>[0]
type ReadFollowTopicsFeed = Parameters<typeof readCommittedFollowTopicsFeedPost>[2]

describe('readCommittedFollowTopicsFeedPost', () => {
  it('returns when the single read includes the committed post', async () => {
    const readFollowTopicsFeed = vi
      .fn<ReadFollowTopicsFeed>()
      .mockResolvedValueOnce({ results: [{ entity_id: 'post-id' }] })

    await readCommittedFollowTopicsFeedPost(user, 'post-id', readFollowTopicsFeed)

    expect(readFollowTopicsFeed).toHaveBeenCalledTimes(1)
    expect(readFollowTopicsFeed).toHaveBeenCalledWith(user, {
      feed_type: 'follow_topics',
      limit: 100,
    })
  })

  it('fails with the missing post id without reading again', async () => {
    const readFollowTopicsFeed = vi
      .fn<ReadFollowTopicsFeed>()
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ results: [{ entity_id: 'missing-post' }] })

    await expect(
      readCommittedFollowTopicsFeedPost(user, 'missing-post', readFollowTopicsFeed),
    ).rejects.toThrow('Post missing-post was not in the follow-topics feed after commit')
    expect(readFollowTopicsFeed).toHaveBeenCalledTimes(1)
  })

  it('passes the requested limit on that single read', async () => {
    const readFollowTopicsFeed = vi
      .fn<ReadFollowTopicsFeed>()
      .mockResolvedValueOnce({ results: [{ entity_id: 'post-id' }] })

    await readCommittedFollowTopicsFeedPost(user, 'post-id', readFollowTopicsFeed, { limit: 5 })

    expect(readFollowTopicsFeed).toHaveBeenCalledTimes(1)
    expect(readFollowTopicsFeed).toHaveBeenCalledWith(user, {
      feed_type: 'follow_topics',
      limit: 5,
    })
  })
})
