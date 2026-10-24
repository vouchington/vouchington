import { describe, it, expect } from 'vitest'
import { Readable } from 'node:stream'
import { iterateFeedListEntries, type ParsedFeedEntry } from './parse.mts'

describe('web feed list entries', () => {
  it('parses valid feed URLs', async () => {
    const text = `http://0x80.pl/feed.xml
https://example.com/rss`

    const entries: ParsedFeedEntry[] = []
    for await (const entry of iterateFeedListEntries(Readable.from([text]), 'web'))
      entries.push(entry)

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

  it('returns empty array for empty input', async () => {
    const entries: ParsedFeedEntry[] = []
    for await (const entry of iterateFeedListEntries(Readable.from(['']), 'web'))
      entries.push(entry)
    expect(entries).toEqual([])
  })

  it('skips blank lines', async () => {
    const text = `https://a.com/feed

https://b.com/feed
   `

    const entries: ParsedFeedEntry[] = []
    for await (const entry of iterateFeedListEntries(Readable.from([text]), 'web'))
      entries.push(entry)
    expect(entries).toHaveLength(2)
  })

  it('skips comment lines starting with #', async () => {
    const text = `# This is a comment
https://a.com/feed
# Another comment
https://b.com/feed`

    const entries: ParsedFeedEntry[] = []
    for await (const entry of iterateFeedListEntries(Readable.from([text]), 'web'))
      entries.push(entry)
    expect(entries).toHaveLength(2)
  })

  it('skips invalid URLs', async () => {
    const text = `not-a-url
https://valid.com/feed
ftp://invalid.com/feed`

    const entries: ParsedFeedEntry[] = []
    for await (const entry of iterateFeedListEntries(Readable.from([text]), 'web'))
      entries.push(entry)
    expect(entries).toHaveLength(1)
    expect(entries[0].feedUrl).toBe('https://valid.com/feed')
  })
})

describe('comic feed list entries', () => {
  it('parses comic feed URLs', async () => {
    const entries: ParsedFeedEntry[] = []
    for await (const entry of iterateFeedListEntries(
      Readable.from(['http://amphibian.com/feeds/atom']),
      'comic',
    ))
      entries.push(entry)

    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({
      feedUrl: 'http://amphibian.com/feeds/atom',
      name: 'amphibian.com',
      slug: 'amphibian-com',
      sourceType: 'comic',
    })
  })
})

describe('YouTube feed list entries', () => {
  it('parses YouTube feed format with channel names', async () => {
    const text = 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_abc # Tom Scott'

    const entries: ParsedFeedEntry[] = []
    for await (const entry of iterateFeedListEntries(Readable.from([text]), 'youtube'))
      entries.push(entry)

    expect(entries).toHaveLength(1)
    expect(entries[0].feedUrl).toBe('https://www.youtube.com/feeds/videos.xml?channel_id=UC_abc')
    expect(entries[0].name).toBe('Tom Scott')
    expect(entries[0].slug).toBe('tom-scott-ucabc')
    expect(entries[0].sourceType).toBe('youtube')
  })

  it('skips lines without # separator', async () => {
    const text = 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_abc'

    const entries: ParsedFeedEntry[] = []
    for await (const entry of iterateFeedListEntries(Readable.from([text]), 'youtube'))
      entries.push(entry)
    expect(entries).toEqual([])
  })

  it('skips lines with empty channel name', async () => {
    const text = 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_abc # '

    const entries: ParsedFeedEntry[] = []
    for await (const entry of iterateFeedListEntries(Readable.from([text]), 'youtube'))
      entries.push(entry)
    expect(entries).toEqual([])
  })
})

describe('iterateFeedListEntries', () => {
  it('keeps a multibyte character split across download chunks', async () => {
    const text = 'https://example.com/foo你bar\n'
    const bytes = Buffer.from(text)
    const character = Buffer.from('你')
    expect(character).toHaveLength(3)
    const splitAt = bytes.indexOf(character) + 1
    const chunks = (async function* () {
      yield bytes.subarray(0, splitAt)
      yield bytes.subarray(splitAt)
    })()

    const feedUrls: string[] = []
    for await (const entry of iterateFeedListEntries(chunks, 'web')) feedUrls.push(entry.feedUrl)

    expect(feedUrls).toEqual(['https://example.com/foo你bar'])
  })
})
