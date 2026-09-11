import { describe, it, expect } from 'vitest'
import { PaginationParser } from '../parser.mts'

describe('PaginationParser — limit', () => {
  const parser = new PaginationParser({ cursor: { type: 'simple' } })

  it('uses default limit (25) when not specified', () => {
    expect(parser.parse({}).limit).toBe(25)
  })

  it('parses a valid limit', () => {
    expect(parser.parse({ limit: '10' }).limit).toBe(10)
  })

  it('clamps limit to max (100 by default)', () => {
    expect(parser.parse({ limit: '999' }).limit).toBe(100)
  })

  it('rejects zero', () => {
    expect(() => parser.parse({ limit: '0' })).toThrow('limit must be a positive integer')
  })

  it('throws 400 for empty string limit', () => {
    let err: unknown
    try {
      parser.parse({ limit: '' })
    } catch (e) {
      err = e
    }
    expect((err as { status: number }).status).toBe(400)
  })

  it('throws 400 for NaN string limit', () => {
    let err: unknown
    try {
      parser.parse({ limit: 'abc' })
    } catch (e) {
      err = e
    }
    expect((err as { status: number }).status).toBe(400)
  })

  it('throws 400 for negative number limit', () => {
    let err: unknown
    try {
      parser.parse({ limit: '-5' })
    } catch (e) {
      err = e
    }
    expect((err as { status: number }).status).toBe(400)
  })

  it.each(['1.5', '2x', '1e2', '+2', ' 2'])('rejects malformed integer %s', value => {
    expect(() => parser.parse({ limit: value })).toThrow('limit must be a positive integer')
  })
})

describe('PaginationParser — custom limit config', () => {
  it('respects custom default', () => {
    const parser = new PaginationParser({
      cursor: { type: 'simple' },
      limit: { default: 50 },
    })
    expect(parser.parse({}).limit).toBe(50)
  })

  it('respects custom max', () => {
    const parser = new PaginationParser({
      cursor: { type: 'simple' },
      limit: { max: 10 },
    })
    expect(parser.parse({ limit: '999' }).limit).toBe(10)
  })

  it('retains the legacy default when only a max is configured', () => {
    const parser = new PaginationParser({
      cursor: { type: 'simple' },
      limit: { max: 10 },
    })

    expect(parser.parse({}).limit).toBe(25)
  })

  it('respects custom min', () => {
    const parser = new PaginationParser({
      cursor: { type: 'simple' },
      limit: { min: 5 },
    })
    expect(parser.parse({ limit: '1' }).limit).toBe(5)
  })
})

describe('PaginationParser — cursor', () => {
  it('parses cursor from default "after" param name', () => {
    const parser = new PaginationParser({ cursor: { type: 'simple' } })
    const encoded = Buffer.from(JSON.stringify({ id: 'abc' })).toString('base64')
    expect(parser.parse({ after: encoded }).after).toBe(encoded)
  })

  it('uses custom cursor param name', () => {
    const parser = new PaginationParser({ cursor: { type: 'simple', paramName: 'cursor' } })
    const encoded = Buffer.from(JSON.stringify({ id: 'xyz' })).toString('base64')
    const result = parser.parse({ cursor: encoded })
    expect(result.after).toBe(encoded)
  })

  it('accepts a configured legacy cursor alias but prefers the canonical parameter', () => {
    const parser = new PaginationParser({
      cursor: { type: 'simple', legacyParamNames: ['cursor'] },
    })
    expect(parser.parse({ cursor: 'legacy-cursor' }).after).toBe('legacy-cursor')
    expect(parser.parse({ after: 'canonical-cursor', cursor: 123 }).after).toBe('canonical-cursor')
  })

  it('throws 400 for non-string cursor value', () => {
    const parser = new PaginationParser({ cursor: { type: 'simple' } })
    let err: unknown
    try {
      parser.parse({ after: 12345 })
    } catch (e) {
      err = e
    }
    expect((err as { status: number }).status).toBe(400)
  })

  it('throws 400 for empty string cursor', () => {
    const parser = new PaginationParser({ cursor: { type: 'simple' } })
    let err: unknown
    try {
      parser.parse({ after: '' })
    } catch (e) {
      err = e
    }
    expect((err as { status: number }).status).toBe(400)
  })

  it('validates the cursor before the limit', () => {
    const parser = new PaginationParser({ cursor: { type: 'simple' } })

    expect(() => parser.parse({ after: 12345, limit: 'invalid' })).toThrow('after must be a string')
  })

  it('omits after from result when no cursor provided', () => {
    const parser = new PaginationParser({ cursor: { type: 'simple' } })
    const result = parser.parse({})
    expect(result.after).toBeUndefined()
  })
})

describe('PaginationParser — filters', () => {
  it('maps enabled post type, time range, sort, and search filters together', () => {
    const parser = new PaginationParser({
      cursor: { type: 'simple' },
      filters: {
        postTypes: true,
        timeRange: true,
        sort: ['newest', 'top'] as const,
        search: true,
      },
    })

    expect(
      parser.parse({
        post_types: 'discussion,review',
        time_range: '1w',
        sort: 'top',
        text_search_query: 'hello world',
        semantic_search_query: 'machine learning',
      }),
    ).toMatchObject({
      post_types: ['discussion', 'review'],
      time_range: '1w',
      sort: 'top',
      text_search_query: 'hello world',
      semantic_search_query: 'machine learning',
    })
  })

  it('parses post_types filter when configured', () => {
    const parser = new PaginationParser({
      cursor: { type: 'simple' },
      filters: { postTypes: true },
    })
    const result = parser.parse({ post_types: 'discussion,review' })
    expect((result as { post_types?: string[] }).post_types).toEqual(['discussion', 'review'])
  })

  it('silently ignores invalid filter values', () => {
    const parser = new PaginationParser({
      cursor: { type: 'simple' },
      filters: { postTypes: true },
    })
    const result = parser.parse({ post_types: 'bogus' })
    expect((result as { post_types?: string[] }).post_types).toBeUndefined()
  })

  it('validates sort against allowed values', () => {
    const parser = new PaginationParser({
      cursor: { type: 'simple' },
      filters: { sort: ['newest', 'top'] as const },
    })
    const valid = parser.parse({ sort: 'newest' })
    expect((valid as { sort?: string }).sort).toBe('newest')

    const invalid = parser.parse({ sort: 'random' })
    expect((invalid as { sort?: string }).sort).toBeUndefined()
  })

  it('passes search params through as strings', () => {
    const parser = new PaginationParser({
      cursor: { type: 'simple' },
      filters: { search: true },
    })
    const result = parser.parse({
      text_search_query: 'hello world',
      semantic_search_query: 'machine learning',
    })
    expect((result as { text_search_query?: string }).text_search_query).toBe('hello world')
    expect((result as { semantic_search_query?: string }).semantic_search_query).toBe(
      'machine learning',
    )
    expect(parser.parse({}).text_search_query).toBeUndefined()
    expect(parser.parse({}).semantic_search_query).toBeUndefined()
  })

  it('does not parse filters when not configured', () => {
    const parser = new PaginationParser({ cursor: { type: 'simple' } })
    const result = parser.parse({ post_types: 'discussion', sort: 'newest' })
    expect((result as { post_types?: unknown }).post_types).toBeUndefined()
    expect((result as { sort?: unknown }).sort).toBeUndefined()
  })

  it('maps topic types only when configured', () => {
    const enabled = new PaginationParser({
      cursor: { type: 'simple' },
      filters: { topicTypes: true },
    })
    const disabled = new PaginationParser({ cursor: { type: 'simple' } })
    expect(enabled.parse({ topic_types: 'topic,card' }).topic_types).toEqual(['topic', 'card'])
    expect(
      (disabled.parse({ topic_types: 'topic,card' }) as Record<string, unknown>).topic_types,
    ).toBeUndefined()
  })

  it('parses time_range when configured', () => {
    const parser = new PaginationParser({
      cursor: { type: 'simple' },
      filters: { timeRange: true },
    })
    const result = parser.parse({ time_range: '1w' })
    expect((result as { time_range?: string }).time_range).toBe('1w')
  })

  it('ignores invalid time_range silently', () => {
    const parser = new PaginationParser({
      cursor: { type: 'simple' },
      filters: { timeRange: true },
    })
    const result = parser.parse({ time_range: 'invalid' })
    expect((result as { time_range?: string }).time_range).toBeUndefined()
  })

  it('does not map time range or search fields unless configured', () => {
    const parser = new PaginationParser({ cursor: { type: 'simple' } })
    const result = parser.parse({
      time_range: '1w',
      text_search_query: 'text',
      semantic_search_query: 'semantic',
    }) as Record<string, unknown>
    expect(result.time_range).toBeUndefined()
    expect(result.text_search_query).toBeUndefined()
    expect(result.semantic_search_query).toBeUndefined()
  })
})
