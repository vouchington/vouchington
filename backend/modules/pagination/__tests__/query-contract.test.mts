import { describe, expect, expectTypeOf, it } from 'vitest'
import { createPaginationParser } from '../index.mts'

describe('query contracts', () => {
  it('derives literal cursor, limit, and filter metadata from pagination configuration', () => {
    const parser = createPaginationParser({
      cursor: { type: ['name', 'score'] as const, paramName: 'cursor' },
      limit: { min: 2, max: 50, default: 20 },
      filters: {
        sort: ['trust', 'name'] as const,
        mediaTypes: true,
        search: true,
      },
    })

    expectTypeOf(parser.queryContract.limit.minimum).toEqualTypeOf<2>()
    expectTypeOf(parser.queryContract.limit.maximum).toEqualTypeOf<50>()
    expectTypeOf(parser.queryContract.limit.default).toEqualTypeOf<20>()

    expect(parser.queryContract).toMatchObject({
      cursor: { kind: 'string' },
      limit: { kind: 'integer', minimum: 2, maximum: 50, default: 20 },
      sort: { kind: 'enum', values: ['trust', 'name'] },
      media_type: { kind: 'enum', values: ['article', 'audio', 'video'] },
      media_types: {
        kind: 'csv-array',
        items: { kind: 'enum', values: ['article', 'audio', 'video'] },
        style: 'form',
        explode: false,
      },
      text_search_query: { kind: 'string' },
      semantic_search_query: { kind: 'string' },
    })
  })

  it('derives default cursor and limit metadata', () => {
    const parser = createPaginationParser({ cursor: { type: 'simple' } })
    expect(parser.queryContract).toEqual({
      after: { kind: 'string' },
      limit: { kind: 'integer', minimum: 1, maximum: 100, default: 25 },
    })
  })

  it('keeps every configured filter represented in runtime and type metadata', () => {
    const parser = createPaginationParser({
      cursor: { type: 'simple' },
      filters: {
        postTypes: true,
        topicTypes: true,
        timeRange: true,
        sort: ['new', 'best'] as const,
        search: true,
        mediaTypes: true,
      },
    })

    expectTypeOf(parser.queryContract.post_types.kind).toEqualTypeOf<'csv-array'>()
    expectTypeOf(parser.queryContract.topic_types.kind).toEqualTypeOf<'csv-array'>()
    expectTypeOf(parser.queryContract.time_range.kind).toEqualTypeOf<'enum'>()
    expectTypeOf(parser.queryContract.sort.values).toEqualTypeOf<readonly ['new', 'best']>()
    expectTypeOf(parser.queryContract.text_search_query.kind).toEqualTypeOf<'string'>()
    expectTypeOf(parser.queryContract.semantic_search_query.kind).toEqualTypeOf<'string'>()
    expectTypeOf(parser.queryContract.media_type.kind).toEqualTypeOf<'enum'>()
    expectTypeOf(parser.queryContract.media_types.kind).toEqualTypeOf<'csv-array'>()
    // @ts-expect-error -- misspelled filters are absent from the public parser contract
    expect(parser.queryContract.post_typse).toBeUndefined()
    expect(Object.keys(parser.queryContract).toSorted()).toEqual(
      [
        'after',
        'limit',
        'post_types',
        'topic_types',
        'time_range',
        'sort',
        'text_search_query',
        'semantic_search_query',
        'media_type',
        'media_types',
      ].toSorted(),
    )
  })
})
