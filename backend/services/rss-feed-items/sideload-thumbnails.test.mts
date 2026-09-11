import { it, expect, describe } from 'vitest'
import type { ViewRssFeedItem } from './types.mts'
import { proxyThumbnailUrls } from './sideload-thumbnails.mts'

describe('sideload-thumbnails', () => {
  function makeItem(id: string, thumbnailUrl?: string): ViewRssFeedItem {
    return {
      __entity_type: 'rss_feed_item',
      id,
      guid: `guid-${id}`,
      published_at: new Date(),
      data: { link: `https://example.com/${id}`, guid: `guid-${id}`, thumbnail_url: thumbnailUrl },
      url: { id: `url-${id}`, url: `https://example.com/${id}` } as ViewRssFeedItem['url'],
      rss_feed: {} as ViewRssFeedItem['rss_feed'],
      categories: [],
    }
  }

  it('proxyThumbnailUrls: returns empty record for empty items array', () => {
    expect(proxyThumbnailUrls([])).toEqual({})
  })

  it('proxyThumbnailUrls: omits items with no thumbnail_url', () => {
    const items = [makeItem('item-1'), makeItem('item-2')]
    expect(proxyThumbnailUrls(items)).toEqual({})
  })

  it('proxyThumbnailUrls: maps item id to a proxied /sideload/ URL', () => {
    const items = [makeItem('item-1', 'https://example.com/thumb.jpg')]
    const result = proxyThumbnailUrls(items)
    expect(result['item-1']).toMatch(/^https?:\/\/[^/]+\/sideload\//)
  })

  it('proxyThumbnailUrls: uses width 400', () => {
    const items = [makeItem('item-1', 'https://example.com/thumb.jpg')]
    const result = proxyThumbnailUrls(items)
    expect(result['item-1']).toContain('w=400')
  })

  it('proxyThumbnailUrls: includes only items with a thumbnail_url', () => {
    const items = [
      makeItem('item-a', 'https://example.com/a.jpg'),
      makeItem('item-b'),
      makeItem('item-c', 'https://example.com/c.jpg'),
    ]
    const result = proxyThumbnailUrls(items)
    expect(Object.keys(result).sort()).toEqual(['item-a', 'item-c'])
    expect(result['item-a']).toMatch(/^https?:\/\/[^/]+\/sideload\//)
    expect(result['item-c']).toMatch(/^https?:\/\/[^/]+\/sideload\//)
  })

  it('proxyThumbnailUrls: base64url-encodes the raw thumbnail URL in the path', () => {
    const raw = 'https://example.com/hero.jpg'
    const encoded = Buffer.from(raw, 'utf8').toString('base64url')
    const items = [makeItem('item-1', raw)]
    const result = proxyThumbnailUrls(items)
    expect(result['item-1']).toContain(`/sideload/${encoded}`)
  })
})
