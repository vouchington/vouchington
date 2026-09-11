import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: { post: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { createLinkPostFromRssFeedItem } from '../rss-feed-items'
import { createStoryPostFromStory } from '../stories'

const mockPost = vi.mocked(clientApi.post)

describe('admission-controlled discussion clients', () => {
  afterEach(() => vi.clearAllMocks())

  it('sends an idempotency key for RSS item discussions', async () => {
    mockPost.mockResolvedValueOnce({ post: {} })

    await createLinkPostFromRssFeedItem('item-1')

    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/rss-feed-items/item-1/discussions',
      {},
      { headers: { 'Idempotency-Key': expect.any(String) } },
    )
  })

  it('sends an idempotency key for story discussions', async () => {
    mockPost.mockResolvedValueOnce({ post: {}, story: {} })

    await createStoryPostFromStory('story-1')

    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/stories/story-1/discussions',
      {},
      { headers: { 'Idempotency-Key': expect.any(String) } },
    )
  })
})
