import { it, expect, vi, describe } from 'vitest'
import { parseFeedDocument } from '@vouchington/rss-parser'
import { fetchAndClassifyFeed } from '../validate.mts'

const SIMPLE_RSS_XML =
  '<rss version="2.0"><channel><title>Test Feed</title>' +
  '<item><link>https://example.com/1</link><guid>1</guid><title>Item 1</title></item>' +
  '</channel></rss>'
const SIMPLE_FEED = parseFeedDocument(Buffer.from(SIMPLE_RSS_XML)).feed
const MOCK_FEED_RESPONSE = {
  responseCode: 200,
  feed: SIMPLE_FEED,
  contentSha256: null,
  headers: { etag: null, lastModified: null },
}

describe('fetchAndClassifyFeed — feed type classification', () => {
  it('returns feedType=video for a YouTube channel feed URL regardless of item content', async () => {
    const crawlerRss = vi
      .fn<(...args: any[]) => Promise<any>>()
      .mockResolvedValue(MOCK_FEED_RESPONSE)

    const result = await fetchAndClassifyFeed(
      'https://www.youtube.com/feeds/videos.xml?channel_id=UCtest123',
      { crawlerRss },
    )

    expect(result).toEqual({ kind: 'feed', title: 'Test Feed', feedType: 'video' })
  })

  it('classifies a plain RSS feed URL by item content', async () => {
    const crawlerRss = vi
      .fn<(...args: any[]) => Promise<any>>()
      .mockResolvedValue(MOCK_FEED_RESPONSE)

    const result = await fetchAndClassifyFeed('https://example.com/feed.xml', { crawlerRss })

    expect(result).toEqual({ kind: 'feed', title: 'Test Feed', feedType: 'article' })
  })
})
