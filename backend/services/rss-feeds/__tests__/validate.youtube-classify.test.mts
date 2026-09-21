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

  it('keeps the title of a parsed Atom feed', async () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom">
      <title>Atom Feed</title><id>urn:feed</id><updated>2026-09-21T00:00:00Z</updated>
      <entry><title>Entry</title><id>urn:entry</id><updated>2026-09-21T00:00:00Z</updated>
        <link href="https://example.com/entry" /></entry>
    </feed>`
    const feed = parseFeedDocument(Buffer.from(atom)).feed
    const crawlerRss = vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
      ...MOCK_FEED_RESPONSE,
      feed,
    })

    const result = await fetchAndClassifyFeed('https://example.com/atom.xml', { crawlerRss })

    expect(result).toEqual({ kind: 'feed', title: 'Atom Feed', feedType: 'article' })
  })
})
