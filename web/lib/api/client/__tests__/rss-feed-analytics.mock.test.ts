import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'

const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn<VitestLooseMock>() }))

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: { post: mockPost },
    }) as unknown as typeof import('../instance'),
)

import { trackRssFeedItemView, trackRssFeedView } from '../rss-feed-analytics'

describe('rss-feed-analytics client', () => {
  beforeEach(() => {
    mockPost.mockReset()
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      value: undefined,
    })
  })

  it('records a feed view through challenge-aware client API with keepalive', async () => {
    await expectApiWrapperCall({
      mock: mockPost,
      response: undefined,
      call: () => trackRssFeedView('feed-abc'),
      expectedArgs: ['/api/v1/rss-feeds/feed-abc/views', undefined, { keepalive: true }],
    })
  })

  it('records an item view through challenge-aware client API with keepalive', async () => {
    await expectApiWrapperCall({
      mock: mockPost,
      response: undefined,
      call: () => trackRssFeedItemView('item-xyz'),
      expectedArgs: ['/api/v1/rss-feed-items/item-xyz/views', undefined, { keepalive: true }],
    })
  })

  it('skips both views when Global Privacy Control is active', async () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      value: true,
    })
    await trackRssFeedView('feed-abc')
    await trackRssFeedItemView('item-xyz')
    expect(mockPost).not.toHaveBeenCalled()
  })
})
