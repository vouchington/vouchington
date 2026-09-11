import { it, expect, describe } from 'vitest'

import { buildRssFeedItemsFromFeed } from './clean.mts'

import type { ParsedFeed } from './types.mts'

describe('buildRssFeedItemsFromFeed', () => {
  it('sets pubDate and isoDate independently from dc.date', () => {
    const feed: ParsedFeed = {
      items: [
        {
          link: 'https://example.com/both-dates',
          guid: 'both-1',
          title: 'Both Dates Item',
          pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
          dc: { date: '2023-12-15T00:00:00Z' },
        },
      ],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0].pubDate).toBe('Mon, 01 Jan 2024 00:00:00 GMT')
    expect(result[0].isoDate).toBe('2023-12-15T00:00:00Z')
  })

  it('sets isoDate to undefined when no date fields present', () => {
    const feed: ParsedFeed = {
      items: [
        {
          link: 'https://example.com/no-date',
          guid: 'no-date-1',
          title: 'No Date Item',
        },
      ],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0].isoDate).toBeUndefined()
  })

  it('strips literal "null" from pubDate', () => {
    const feed: ParsedFeed = {
      items: [{ link: 'https://example.com/null-pd', guid: 'null-pd-1', pubDate: 'null' }],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0].pubDate).toBeUndefined()
  })

  it('strips literal "null" from isoDate', () => {
    const feed: ParsedFeed = {
      items: [{ link: 'https://example.com/null-id', guid: 'null-id-1', isoDate: 'null' }],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0].isoDate).toBeUndefined()
  })

  it('strips "NULL", " null " case/whitespace variants from date fields', () => {
    const feed: ParsedFeed = {
      items: [
        {
          link: 'https://example.com/null-var',
          guid: 'null-var-1',
          pubDate: 'NULL',
          isoDate: ' null ',
        },
      ],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0].pubDate).toBeUndefined()
    expect(result[0].isoDate).toBeUndefined()
  })

  it('strips pre-1970 sentinel date fields', () => {
    const feed: ParsedFeed = {
      items: [
        {
          link: 'https://example.com/year-one',
          guid: 'year-one-1',
          pubDate: 'Mon, 01 Jan 0001 00:00:00 +0000',
          isoDate: '0001-01-01T00:00:00Z',
        },
      ],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0].pubDate).toBeUndefined()
    expect(result[0].isoDate).toBeUndefined()
  })

  it('strips invalid date fields', () => {
    const feed: ParsedFeed = {
      items: [
        {
          link: 'https://example.com/bad-date',
          guid: 'bad-date-1',
          pubDate: 'not a date',
          isoDate: 'Infinity',
        },
      ],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0].pubDate).toBeUndefined()
    expect(result[0].isoDate).toBeUndefined()
  })

  it('preserves RFC dates with two-digit years and numeric timezones', () => {
    const feed: ParsedFeed = {
      items: [
        {
          link: 'https://example.com/two-digit-year',
          guid: 'two-digit-year-1',
          pubDate: 'Sun, 06 Nov 94 08:49:37 +0000',
        },
      ],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0].pubDate).toBe('Sun, 06 Nov 94 08:49:37 +0000')
  })

  it('preserves valid date strings after null-stripping guard', () => {
    const feed: ParsedFeed = {
      items: [
        {
          link: 'https://example.com/valid-dates',
          guid: 'valid-d-1',
          pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
          isoDate: '2024-01-01T00:00:00Z',
        },
      ],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0].pubDate).toBe('Mon, 01 Jan 2024 00:00:00 GMT')
    expect(result[0].isoDate).toBe('2024-01-01T00:00:00Z')
  })
})
