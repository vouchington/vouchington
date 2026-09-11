import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { sendRssFeedItemToFollowers, shareRssFeedItemWithFollowers } from '../rss-feeds'
import { clientApi } from '../instance'

const mockPost = vi.mocked(clientApi.post)

describe('RSS feed item follower distribution client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('POSTs a bodyless RSS feed item share', async () => {
    const response = { status: 'accepted', distribution_id: 'distribution-1' }
    mockPost.mockResolvedValueOnce(response)

    await expect(shareRssFeedItemWithFollowers('item id')).resolves.toBe(response)
    expect(mockPost).toHaveBeenCalledWith('/api/v1/rss-feed-items/item%20id/shares')
  })

  it('POSTs a validated selected follower send', async () => {
    const response = { status: 'accepted', distribution_id: 'distribution-1' }
    mockPost.mockResolvedValueOnce(response)
    const body = {
      audience: 'selected_followers',
      recipient_user_ids: ['01900000-0000-7000-8000-000000000001'],
    } as const

    await expect(sendRssFeedItemToFollowers('item id', body)).resolves.toBe(response)
    expect(mockPost).toHaveBeenCalledWith('/api/v1/rss-feed-items/item%20id/sends', body)
  })
})
