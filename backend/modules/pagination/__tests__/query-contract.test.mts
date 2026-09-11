import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  composeQueryContracts,
  createPaginationParser,
  defineQueryContract,
  queryBoolean,
  queryCsvArray,
  queryEnum,
  queryInteger,
  queryNullableBoolean,
  queryNumber,
  queryString,
  queryUuid,
  queryUuidOrUri,
  withQueryContract,
} from '../index.mts'
import { definePaginationFilterContractBuilder } from '../pagination-query-contract-builder.mts'

describe('query contracts', () => {
  it('builds neutral scalar and CSV array descriptors', () => {
    expect(queryString()).toEqual({ kind: 'string' })
    expect(queryUuid()).toEqual({ kind: 'string', format: 'uuid' })
    expect(queryUuidOrUri()).toEqual({ kind: 'uuid-or-uri' })
    expect(queryBoolean()).toEqual({ kind: 'boolean' })
    expect(queryNullableBoolean()).toEqual({ kind: 'nullable-boolean' })
    expect(queryNumber()).toEqual({ kind: 'number' })
    expect(queryInteger({ minimum: 0, maximum: 365 })).toEqual({
      kind: 'integer',
      minimum: 0,
      maximum: 365,
    })
    expect(queryCsvArray(queryEnum(['one', 'two'] as const))).toEqual({
      kind: 'csv-array',
      items: { kind: 'enum', values: ['one', 'two'] },
      style: 'form',
      explode: false,
    })
    const enumWithDefault = queryEnum(['new', 'top'] as const, { default: 'new' })
    expectTypeOf(enumWithDefault.default).toEqualTypeOf<'new'>()
    expect(enumWithDefault).toEqual({ kind: 'enum', values: ['new', 'top'], default: 'new' })

    const described = queryString({ description: 'Search text' })
    expectTypeOf(described.description).toEqualTypeOf<'Search text'>()
    expect(described).toEqual({ kind: 'string', description: 'Search text' })
  })

  it('defines, composes, and attaches query contracts without changing the callable', () => {
    function double(value: number): number {
      return value * 2
    }
    const callable = withQueryContract(double, defineQueryContract({ query: queryString() }))

    expect(callable(4)).toBe(8)
    expect(callable.queryContract).toEqual({ query: { kind: 'string' } })
    const first = defineQueryContract({ after: queryString() })
    const second = defineQueryContract({ limit: queryInteger({ minimum: 1, maximum: 10 }) })

    expect(composeQueryContracts(first, second).queryContract).toEqual({
      after: { kind: 'string' },
      limit: { kind: 'integer', minimum: 1, maximum: 10 },
    })
    expect(() => composeQueryContracts(first, first)).toThrow(
      'Duplicate query parameter contract: after',
    )
  })

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

  it('rejects pagination filter builders that add typo keys beside allowed keys', () => {
    const buildContract = () => ({
      post_types: queryCsvArray(queryEnum(['discussion'] as const)),
      post_typse: queryString(),
    })

    // @ts-expect-error -- a filter builder cannot add keys outside its exact allowed set
    const builder = definePaginationFilterContractBuilder('postTypes', buildContract)

    expect(builder).toBe(buildContract)
  })

  it('rejects malformed descriptor shapes at contract and composition boundaries', () => {
    const malformed = { queryContract: { limit: { kind: 'integer' } } } as const

    // @ts-expect-error -- integer query descriptors require minimum and maximum bounds
    const malformedContract = defineQueryContract({ limit: { kind: 'integer' } })
    expect(malformedContract).toEqual(malformed)

    // @ts-expect-error -- composition rejects malformed carrier contracts
    expect(composeQueryContracts(malformed).queryContract).toEqual(malformed.queryContract)

    // @ts-expect-error -- callable composition rejects malformed carrier contracts
    expect(withQueryContract(() => undefined, malformed).queryContract).toEqual(
      malformed.queryContract,
    )
  })
})
