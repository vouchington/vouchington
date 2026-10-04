import { describe, expect, it } from 'vitest'
import { PaginationParser } from '../parser.mts'

describe('runtime parser bounds', () => {
  it('clamps omitted defaults and supplied limits while leaving the query contract unchanged', () => {
    const parser = new PaginationParser({
      cursor: { type: 'simple' },
      limit: { min: 1, max: 100, default: 25 },
    })
    const contract = structuredClone(parser.queryContract)
    expect(parser.parse({}, { default: 25, max: 5 }).limit).toBe(5)
    expect(parser.parse({ limit: '100' }, { default: 25, max: 5 }).limit).toBe(5)
    expect(parser.parse({}, { default: 3, max: 5 }).limit).toBe(3)
    expect(parser.queryContract).toEqual(contract)
  })
  it('never accepts runtime bounds beyond its static ceiling', () => {
    const parser = new PaginationParser({
      cursor: { type: 'simple' },
      limit: { min: 1, max: 25, default: 10 },
    })
    expect(parser.parse({}, { default: 1000, max: 1000 }).limit).toBe(25)
    expect(parser.parse({ limit: '1000' }, { default: 1000, max: 1000 }).limit).toBe(25)
    expect(parser.parse({}, { default: 0, max: 0 }).limit).toBe(1)
  })
})
