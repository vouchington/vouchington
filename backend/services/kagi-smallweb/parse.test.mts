import { describe, it, expect } from 'vitest'
import {
  parseWebFeedList,
  parseComicFeedList,
  parseYouTubeFeedList,
  parseFeedList,
} from './parse.mts'

describe('parseWebFeedList', () => {
  it('parses valid feed URLs', () => {
    const text = `http://0x80.pl/feed.xml
https://example.com/rss`

    const entries = parseWebFeedList(text)

    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual({
      feedUrl: 'http://0x80.pl/feed.xml',
      name: '0x80.pl',
      slug: '0x80-pl',
      sourceType: 'web',
    })
    expect(entries[1]).toEqual({
      feedUrl: 'https://example.com/rss',
      name: 'example.com',
      slug: 'example-com',
      sourceType: 'web',
    })
  })

  it('returns empty array for empty input', () => {
    expect(parseWebFeedList('')).toEqual([])
  })

  it('skips blank lines', () => {
    const text = `https://a.com/feed

https://b.com/feed
   `

    expect(parseWebFeedList(text)).toHaveLength(2)
  })

  it('skips comment lines starting with #', () => {
    const text = `# This is a comment
https://a.com/feed
# Another comment
https://b.com/feed`

    expect(parseWebFeedList(text)).toHaveLength(2)
  })

  it('skips invalid URLs', () => {
    const text = `not-a-url
https://valid.com/feed
ftp://invalid.com/feed`

    const entries = parseWebFeedList(text)
    expect(entries).toHaveLength(1)
    expect(entries[0].feedUrl).toBe('https://valid.com/feed')
  })

  it('deduplicates same URL', () => {
    const text = `https://a.com/feed
https://a.com/feed`

    expect(parseWebFeedList(text)).toHaveLength(1)
  })
})

describe('parseComicFeedList', () => {
  it('parses comic feed URLs', () => {
    const entries = parseComicFeedList('http://amphibian.com/feeds/atom')

    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({
      feedUrl: 'http://amphibian.com/feeds/atom',
      name: 'amphibian.com',
      slug: 'amphibian-com',
      sourceType: 'comic',
    })
  })
})

describe('parseYouTubeFeedList', () => {
  it('parses YouTube feed format with channel names', () => {
    const text = 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_abc # Tom Scott'

    const entries = parseYouTubeFeedList(text)

    expect(entries).toHaveLength(1)
    expect(entries[0].feedUrl).toBe('https://www.youtube.com/feeds/videos.xml?channel_id=UC_abc')
    expect(entries[0].name).toBe('Tom Scott')
    expect(entries[0].slug).toBe('tom-scott-ucabc')
    expect(entries[0].sourceType).toBe('youtube')
  })

  it('skips lines without # separator', () => {
    const text = 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_abc'

    expect(parseYouTubeFeedList(text)).toEqual([])
  })

  it('skips lines with empty channel name', () => {
    const text = 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_abc # '

    expect(parseYouTubeFeedList(text)).toEqual([])
  })

  it('deduplicates same YouTube URL', () => {
    const text = `https://www.youtube.com/feeds/videos.xml?channel_id=UC_abc # Channel A
https://www.youtube.com/feeds/videos.xml?channel_id=UC_abc # Channel A`

    expect(parseYouTubeFeedList(text)).toHaveLength(1)
  })
})

describe('parseFeedList', () => {
  it('dispatches to correct parser by source type', () => {
    const webEntries = parseFeedList('https://a.com/feed', 'web')
    expect(webEntries[0].sourceType).toBe('web')

    const comicEntries = parseFeedList('https://b.com/feed', 'comic')
    expect(comicEntries[0].sourceType).toBe('comic')

    const ytEntries = parseFeedList(
      'https://www.youtube.com/feeds/videos.xml?channel_id=UC_abc # Test',
      'youtube',
    )
    expect(ytEntries[0].sourceType).toBe('youtube')
  })
})
