import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        post: vi.fn<VitestLooseMock>(),
        delete: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import {
  rejectRssFeedCategory,
  unrejectRssFeedCategory,
  assignRssFeedCategory,
} from '../rss-feed-categories'

const mockPost = vi.mocked(clientApi.post)
const mockDelete = vi.mocked((clientApi as { delete: VitestLooseMock }).delete)

describe('rss-feed-categories client helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('rejectRssFeedCategory POSTs to /rejections with category_text', async () => {
    mockPost.mockResolvedValueOnce(undefined)
    await rejectRssFeedCategory('news')
    expect(mockPost).toHaveBeenCalledWith('/api/v1/rss-feed-categories/rejections', {
      category_text: 'news',
    })
  })

  it('unrejectRssFeedCategory DELETEs from /rejections with body', async () => {
    mockDelete.mockResolvedValueOnce(undefined)
    await unrejectRssFeedCategory('news')
    expect(mockDelete).toHaveBeenCalledWith('/api/v1/rss-feed-categories/rejections', {
      body: { category_text: 'news' },
    })
  })

  it('assignRssFeedCategory POSTs to /assignments and returns { updated }', async () => {
    mockPost.mockResolvedValueOnce({ updated: 7 })
    const result = await assignRssFeedCategory('credit-cards', 'topic-id-1')
    expect(mockPost).toHaveBeenCalledWith('/api/v1/rss-feed-categories/assignments', {
      category_text: 'credit-cards',
      topic_id: 'topic-id-1',
    })
    expect(result).toEqual({ updated: 7 })
  })
})
