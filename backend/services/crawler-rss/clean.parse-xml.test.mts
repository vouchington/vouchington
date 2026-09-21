import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { it, expect, describe } from 'vitest'
import { parseRssFeedItemsFromXml } from './clean.mts'
import {
  extractMediaDescription,
  extractMediaStarRating,
  extractMediaStatistics,
} from '@services/rss-feed-items/media-community'

describe('parseRssFeedItemsFromXml', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const fixturesDir = path.resolve(__dirname, 'fixtures/feed-cleaning')

  function loadFixture(fileName: string): Buffer {
    return readFileSync(path.resolve(fixturesDir, fileName))
  }

  it('parses RSS XML and returns items', () => {
    const rss = `<?xml version="1.0"?>
  <rss version="2.0"><channel>
    <title>Feed</title>
    <item>
      <link>https://example.com/i</link>
      <guid>my-guid</guid>
      <title>Item</title>
    </item>
  </channel></rss>`
    const result = parseRssFeedItemsFromXml(Buffer.from(rss, 'utf8'))
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      link: 'https://example.com/i',
      guid: 'my-guid',
      title: 'Item',
      categories: [],
    })
  })

  it('parses Atom XML and returns items', () => {
    const atom = `<?xml version="1.0" encoding="utf-8"?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <title>Example Atom Feed</title>
    <id>urn:uuid:feed-1</id>
    <updated>2024-01-01T00:00:00Z</updated>
    <entry>
      <title>Atom Item</title>
      <summary type="html">Atom &lt;em&gt;summary&lt;/em&gt;</summary>
      <content type="html">Atom &lt;p&gt;content&lt;/p&gt;</content>
      <id>urn:uuid:entry-1</id>
      <link href="https://example.com/atom-item" />
      <updated>2024-01-01T00:00:00Z</updated>
    </entry>
  </feed>`
    const result = parseRssFeedItemsFromXml(Buffer.from(atom, 'utf8'))
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      link: 'https://example.com/atom-item',
      guid: 'urn:uuid:entry-1',
      title: 'Atom Item',
      summary: 'Atom <em>summary</em>',
      content: 'Atom <p>content</p>',
    })
  })

  it('extracts audio media fields from podcast RSS', () => {
    const items = parseRssFeedItemsFromXml(loadFixture('podcast-rss.xml'))

    expect(items).toHaveLength(2)
    const [ep42] = items
    expect(ep42.media_type).toBe('audio')
    expect(ep42.enclosure_url).toBe('https://cdn.podcast.example.com/ep42.mp3')
    expect(ep42.enclosure_type).toBe('audio/mpeg')
    expect(ep42.enclosure_length).toBe(50_000_000)
    expect(ep42.duration_seconds).toBe(2730) // 45:30 = 45*60 + 30
    expect(ep42.thumbnail_url).toBe('https://podcast.example.com/episodes/42/art.jpg')
  })

  it('extracts video media fields from YouTube Atom feed', () => {
    const items = parseRssFeedItemsFromXml(loadFixture('youtube-atom.xml'))

    expect(items).toHaveLength(2)
    const [vid1] = items
    expect(vid1.media_type).toBe('video')
    expect(vid1.video_id).toBe('abc123def456')
    expect(vid1.video_platform).toBe('youtube')
    expect(vid1.player_url).toBe('https://www.youtube-nocookie.com/embed/abc123def456')
    expect(vid1.thumbnail_url).toBe('https://i4.ytimg.com/vi/abc123def456/hqdefault.jpg')
    expect(vid1['media:description']).toBe('A test YouTube video description.')
    expect(vid1['media:starRating']).toEqual({ average: 5, count: 100, min: 1, max: 5 })
    expect(vid1['media:statistics']).toEqual({ views: 1000 })
  })

  it('ignores empty and non-numeric media community values', () => {
    const item = {
      media: {
        group: {
          community: {
            starRating: {
              average: null,
              count: '',
              min: false,
              max: '5',
            },
            statistics: {
              views: '',
            },
          },
        },
      },
    }

    expect(extractMediaStarRating(item)).toEqual({ max: 5 })
    expect(extractMediaStatistics(item)).toBeUndefined()
  })

  it('extracts item-level media descriptions and community values', () => {
    const item = {
      media: {
        description: { value: 'Item-level media description.' },
        community: {
          starRating: { average: '4.5', count: '20', min: '1', max: '5' },
          statistics: { views: '1234' },
        },
      },
    }

    expect(extractMediaDescription(item)).toBe('Item-level media description.')
    expect(extractMediaStarRating(item)).toEqual({ average: 4.5, count: 20, min: 1, max: 5 })
    expect(extractMediaStatistics(item)).toEqual({ views: 1234 })
  })

  it('sets media_type=article for plain article items', () => {
    const items = parseRssFeedItemsFromXml(loadFixture('rss-with-share.xml'))

    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item.media_type).toBe('article')
      expect(item.enclosure_url).toBeUndefined()
      expect(item.video_id).toBeUndefined()
    }
  })

  it('extracts isoDate from RSS 2.0 with dc:date namespace', () => {
    const rss = `<?xml version="1.0"?>
  <rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
    <channel>
      <title>A List Apart</title>
      <item>
        <link>https://alistapart.com/article/test</link>
        <guid>https://alistapart.com/article/test</guid>
        <title>Test Article</title>
        <dc:date>2025-10-15T15:35:00+00:00</dc:date>
      </item>
    </channel>
  </rss>`
    const result = parseRssFeedItemsFromXml(Buffer.from(rss, 'utf8'))
    expect(result).toHaveLength(1)
    expect(result[0].isoDate).toBe('2025-10-15T15:35:00+00:00')
    expect(result[0].pubDate).toBeUndefined()
  })

  it('extracts isoDate from RDF feed with dc:date', () => {
    const rdf = `<?xml version="1.0"?>
  <rdf:RDF
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns="http://purl.org/rss/1.0/"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
  >
    <channel rdf:about="https://example.com/">
      <title>RDF Feed</title>
      <link>https://example.com/</link>
      <description>RDF feed</description>
    </channel>
    <item rdf:about="https://example.com/rdf-item">
      <title>RDF Item</title>
      <link>https://example.com/rdf-item</link>
      <dc:date>2025-03-20T10:00:00Z</dc:date>
    </item>
  </rdf:RDF>`
    const result = parseRssFeedItemsFromXml(Buffer.from(rdf, 'utf8'))
    expect(result).toHaveLength(1)
    expect(result[0].isoDate).toBe('2025-03-20T10:00:00Z')
  })
})
