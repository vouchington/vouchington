import { expect, it, vi, describe } from 'vitest'
import { createRssFeedUrlId } from './rss-feed-url-id.mts'

describe('rss-feed-url-id', () => {
  it('forwards query.client when called inside a transaction', async () => {
    const client = {} as object
    const query = Object.assign(vi.fn<(...args: any[]) => any>(), { client })
    const addUrlImpl = vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ id: 'url-1' })

    const result = await createRssFeedUrlId('https://example.com/feed.xml', {
      query,
      addUrlImpl,
    })

    expect(result).toBe('url-1')
    expect(addUrlImpl).toHaveBeenCalledWith(
      null,
      'https://example.com/feed.xml',
      expect.objectContaining({
        content_type: 'application/rss+xml',
        query,
        client,
      }),
    )
  })
})
