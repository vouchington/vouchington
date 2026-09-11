import { describe, it, expect } from 'vitest'
import { parseCsvRows, parseCsvToUrls, stripBom } from './parse-csv.mts'

describe('stripBom', () => {
  it('strips UTF-8 BOM from the start', () => {
    expect(stripBom('﻿hello')).toBe('hello')
  })

  it('is a no-op when no BOM is present', () => {
    expect(stripBom('hello')).toBe('hello')
  })

  it('only strips the leading BOM, not mid-string occurrences', () => {
    expect(stripBom('hello﻿world')).toBe('hello﻿world')
  })
})

describe('parseCsvRows', () => {
  it('parses valid CSV with headers', () => {
    const csv = `slug,name,topic_type\nmy-topic,My Topic,topic\n`
    const rows = parseCsvRows(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ slug: 'my-topic', name: 'My Topic', topic_type: 'topic' })
  })

  it('strips UTF-8 BOM before parsing (Excel/Google Sheets compat)', () => {
    const csv = `﻿slug,name\nmy-topic,My Topic\n`
    const rows = parseCsvRows(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ slug: 'my-topic', name: 'My Topic' })
  })

  it('handles quoted fields with commas', () => {
    const csv = `slug,name\nmy-topic,"Name, With Comma"\n`
    const rows = parseCsvRows(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Name, With Comma')
  })

  it('returns empty array for header-only CSV', () => {
    const csv = `slug,name,topic_type\n`
    const rows = parseCsvRows(csv)
    expect(rows).toHaveLength(0)
  })

  it('skips empty lines', () => {
    const csv = `slug,name\nmy-topic,My Topic\n\nanother-topic,Another Topic\n`
    const rows = parseCsvRows(csv)
    expect(rows).toHaveLength(2)
  })

  it('trims whitespace from values', () => {
    const csv = `slug,name\n  my-topic  ,  My Topic  \n`
    const rows = parseCsvRows(csv)
    expect(rows[0].slug).toBe('my-topic')
    expect(rows[0].name).toBe('My Topic')
  })

  it('preserves whitespace inside quoted headers and values while trimming unquoted cells', () => {
    const csv = ' slug ," display name "\n topic-a ,"  Topic A  "\n'

    expect(parseCsvRows(csv)).toEqual([{ slug: 'topic-a', ' display name ': '  Topic A  ' }])
  })

  it('keeps the last duplicate header and supports empty header names', () => {
    const csv = 'slug,slug,,name\nfirst,last,empty,Topic A\n'

    expect(parseCsvRows(csv)).toEqual([{ slug: 'last', '': 'empty', name: 'Topic A' }])
  })

  it('handles unicode content', () => {
    const csv = `slug,name\nmy-topic,日本語テスト\n`
    const rows = parseCsvRows(csv)
    expect(rows[0].name).toBe('日本語テスト')
  })

  it('throws on malformed CSV (mismatched columns)', () => {
    const csv = `slug,name\nmy-topic,My Topic,extra-column\n`
    expect(() => parseCsvRows(csv)).toThrow(Error)
  })

  it('parses multiple rows correctly', () => {
    const csv = `slug,name,rss_feed_url,rss_feed_title\ntopic-a,Topic A,https://a.com/feed.xml,Feed A\ntopic-b,Topic B,,\n`
    const rows = parseCsvRows(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0].rss_feed_url).toBe('https://a.com/feed.xml')
    expect(rows[1].rss_feed_url).toBe('')
  })
})

describe('parseCsvToUrls', () => {
  it('extracts URLs from a csv with a url column', () => {
    const csv = `title,url,feed_type\nFeed A,https://a.com/feed,article\nFeed B,https://b.com/feed,podcast\n`
    const { urls, recognized } = parseCsvToUrls(csv)
    expect(recognized).toBe(true)
    expect(urls).toEqual(['https://a.com/feed', 'https://b.com/feed'])
  })

  it('matches xmlUrl column case-insensitively', () => {
    const csv = `xmlUrl,title\nhttps://b.com/feed,My Feed\n`
    const { urls, recognized } = parseCsvToUrls(csv)
    expect(recognized).toBe(true)
    expect(urls).toEqual(['https://b.com/feed'])
  })

  it('matches rss_feed_url column', () => {
    const csv = `rss_feed_url,name\nhttps://c.com/rss,Feed C\n`
    const { urls, recognized } = parseCsvToUrls(csv)
    expect(recognized).toBe(true)
    expect(urls).toEqual(['https://c.com/rss'])
  })

  it('returns recognized: false when no recognized URL column', () => {
    const csv = `name,description\nFoo,Bar\n`
    const { urls, recognized } = parseCsvToUrls(csv)
    expect(recognized).toBe(false)
    expect(urls).toEqual([])
  })

  it('recognizes a header-only URL CSV', () => {
    const { urls, recognized } = parseCsvToUrls('url,title\n')

    expect(recognized).toBe(true)
    expect(urls).toEqual([])
  })

  it('skips empty URL values', () => {
    const csv = `url,title\nhttps://a.com/feed,Feed A\n,Empty\nhttps://b.com/feed,Feed B\n`
    const { urls, recognized } = parseCsvToUrls(csv)
    expect(recognized).toBe(true)
    expect(urls).toEqual(['https://a.com/feed', 'https://b.com/feed'])
  })

  it('handles UTF-8 BOM prefix', () => {
    const csv = `﻿url,title\nhttps://a.com/feed,Feed A\n`
    const { urls, recognized } = parseCsvToUrls(csv)
    expect(recognized).toBe(true)
    expect(urls).toEqual(['https://a.com/feed'])
  })

  it('returns recognized: false for empty input', () => {
    const { urls, recognized } = parseCsvToUrls('')
    expect(recognized).toBe(false)
    expect(urls).toEqual([])
  })

  it('throws for malformed CSV', () => {
    expect(() => parseCsvToUrls('not,a\nvalid,"csv with mismatched\n')).toThrow('Quote Not Closed')
  })

  it('throws for CSV with mismatched column counts', () => {
    // "My, Feed" is one field but the extra comma makes it look like 3 columns
    expect(() => parseCsvToUrls('title,url\nMy, Feed,https://example.com/rss\n')).toThrow(
      'Invalid Record Length',
    )
  })
})
