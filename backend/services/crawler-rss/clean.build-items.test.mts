import { it, expect, describe } from 'vitest'

import { buildRssFeedItemsFromFeed } from './clean.mts'

import type { ParsedFeed } from './types.mts'

describe('buildRssFeedItemsFromFeed', () => {
  it('returns items with link and guid (RSS shape)', () => {
    const feed: ParsedFeed = {
      title: 'Test Feed',
      items: [
        {
          link: 'https://example.com/1',
          guid: 'guid-1',
          title: 'Item 1',
          description: 'Desc 1',
          pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
        },
        {
          link: 'https://example.com/2',
          guid: { value: 'guid-2' },
          title: 'Item 2',
        },
      ],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      link: 'https://example.com/1',
      guid: 'guid-1',
      title: 'Item 1',
      description: 'Desc 1',
      pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
    })
    expect(result[1]).toMatchObject({
      link: 'https://example.com/2',
      guid: 'guid-2',
      title: 'Item 2',
    })
  })

  it('uses content.encoded from feedsmith content namespace', () => {
    const feed: ParsedFeed = {
      items: [
        {
          link: 'https://example.com/p',
          guid: 'g',
          content: { encoded: '<p>Full content</p>' },
          description: 'Short',
        },
      ],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0]['content:encoded']).toBe('<p>Full content</p>')
    expect(result[0].content).toBe('<p>Full content</p>')
    expect(result[0].description).toBe('Short')
  })

  it('uses entries for Atom-shaped feed', () => {
    const feed: ParsedFeed = {
      entries: [
        {
          link: 'https://example.com/a',
          guid: 'atom-guid',
          title: 'Atom entry',
        },
      ],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      link: 'https://example.com/a',
      guid: 'atom-guid',
      title: 'Atom entry',
    })
  })

  it('uses Atom id when guid is absent', () => {
    const feed: ParsedFeed = {
      entries: [{ link: 'https://example.com/atom-id', id: 'atom-id-1', title: 'Atom id entry' }],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0].guid).toBe('atom-id-1')
  })

  it('uses JSON Feed url and id fields', () => {
    const feed: ParsedFeed = {
      items: [{ url: 'https://example.com/json-item', id: 'json-id-1', title: 'JSON item' }],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      link: 'https://example.com/json-item',
      guid: 'json-id-1',
      title: 'JSON item',
    })
  })

  it('falls back to link as guid when guid/id are absent', () => {
    const feed: ParsedFeed = {
      items: [{ link: 'https://example.com/rdf-like', title: 'RDF-like entry' }],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0].guid).toBe('https://example.com/rdf-like')
  })

  it('normalizes categories from { name } to string[]', () => {
    const feed: ParsedFeed = {
      items: [
        {
          link: 'https://example.com/c',
          guid: 'g',
          categories: [{ name: 'Tech' }, { name: 'News' }],
        },
      ],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result[0].categories).toEqual(['Tech', 'News'])
  })

  it('filters out items without link and without any guid/id/link fallback', () => {
    const feed: ParsedFeed = {
      items: [
        { link: 'https://example.com/ok', guid: 'g' },
        { link: '', guid: 'g2' },
        { link: 'https://example.com/ok2' },
        { guid: 'g3' },
      ],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(2)
    expect(result[0].link).toBe('https://example.com/ok')
    expect(result[1].link).toBe('https://example.com/ok2')
    expect(result[1].guid).toBe('https://example.com/ok2')
  })

  it('extracts isoDate from dc.date (Dublin Core singular)', () => {
    const feed: ParsedFeed = {
      items: [
        {
          link: 'https://example.com/dc-date',
          guid: 'dc-1',
          title: 'DC Date Item',
          dc: { date: '2025-10-15T15:35:00+00:00' },
        },
      ],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0].isoDate).toBe('2025-10-15T15:35:00+00:00')
  })

  it('extracts isoDate from dc.dates array', () => {
    const feed: ParsedFeed = {
      items: [
        {
          link: 'https://example.com/dc-dates',
          guid: 'dc-2',
          title: 'DC Dates Item',
          dc: { dates: ['2025-10-15T15:35:00+00:00', '2025-10-16T00:00:00Z'] },
        },
      ],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0].isoDate).toBe('2025-10-15T15:35:00+00:00')
  })

  it('prefers dc.date over dc.dates array', () => {
    const feed: ParsedFeed = {
      items: [
        {
          link: 'https://example.com/dc-both',
          guid: 'dc-3',
          title: 'DC Both Item',
          dc: { date: '2025-09-01T00:00:00Z', dates: ['2025-10-15T15:35:00+00:00'] },
        },
      ],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0].isoDate).toBe('2025-09-01T00:00:00Z')
  })

  it('extracts isoDate from Atom published', () => {
    const feed: ParsedFeed = {
      entries: [
        {
          link: 'https://example.com/atom-pub',
          id: 'atom-pub-1',
          title: 'Atom Published Item',
          published: '2025-06-01T12:00:00Z',
          updated: '2025-06-02T12:00:00Z',
        },
      ],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0].isoDate).toBe('2025-06-01T12:00:00Z')
  })

  it('falls back to Atom updated when published is absent', () => {
    const feed: ParsedFeed = {
      entries: [
        {
          link: 'https://example.com/atom-upd',
          id: 'atom-upd-1',
          title: 'Atom Updated Item',
          updated: '2025-06-02T12:00:00Z',
        },
      ],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0].isoDate).toBe('2025-06-02T12:00:00Z')
  })

  it('extracts isoDate from JSON Feed date_published', () => {
    const feed: ParsedFeed = {
      items: [
        {
          url: 'https://example.com/json-pub',
          id: 'json-pub-1',
          title: 'JSON Published Item',
          date_published: '2025-07-01T00:00:00Z',
        },
      ],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0].isoDate).toBe('2025-07-01T00:00:00Z')
  })
})
