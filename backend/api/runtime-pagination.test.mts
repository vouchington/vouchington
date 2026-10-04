import { describe, expect, it } from 'vitest'
import { createPaginationParser } from '@modules/pagination'
import { paginationConfig } from '@services/pagination/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { parseRuntimePagination } from './runtime-pagination.mts'

describe('API runtime pagination adapter', () => {
  it('uses configured omitted defaults without mutating advertised schema limits', () => {
    const parser = createPaginationParser({
      cursor: { type: 'simple' },
      limit: { min: 1, max: 100, default: 25 },
    })
    const contract = structuredClone(parser.queryContract)
    overrideDynamicConfigFieldsForTest(paginationConfig, { default_limit: 9, max_limit: 4 })
    expect(parseRuntimePagination(parser, {}).limit).toBe(4)
    expect(parseRuntimePagination(parser, { limit: '100' }).limit).toBe(4)
    expect(parser.queryContract).toEqual(contract)
    expect(parser.queryContract.limit).toMatchObject({ maximum: 100, default: 25 })
  })
  it('honors a captured request snapshot while preserving exception ceilings', () => {
    const parser = createPaginationParser({
      cursor: { type: 'simple' },
      limit: { min: 1, max: 25, default: 10 },
    })
    overrideDynamicConfigFieldsForTest(paginationConfig, { small_max_limit: 1 })
    expect(parseRuntimePagination(parser, {}, { default: 4, max: 4 }).limit).toBe(4)
    expect(
      parseRuntimePagination(parser, { limit: '100' }, { default: 1000, max: 1000 }).limit,
    ).toBe(25)
    expect(parser.queryContract.limit).toMatchObject({ maximum: 25, default: 10 })
  })
})
