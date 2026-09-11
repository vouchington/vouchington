import { describe, expect, it } from 'vitest'
import {
  POINT_VALUATION_SEED_COUNT,
  POINT_VALUATION_SEED_OWNER_COUNT,
} from './point-valuations.mts'

describe('point-valuation EXPLAIN seed shape', () => {
  it('models an interleaved multi-owner second page', () => {
    expect(POINT_VALUATION_SEED_OWNER_COUNT).toBeGreaterThanOrEqual(100)
    expect(POINT_VALUATION_SEED_COUNT % POINT_VALUATION_SEED_OWNER_COUNT).toBe(0)
    expect(POINT_VALUATION_SEED_COUNT / POINT_VALUATION_SEED_OWNER_COUNT).toBeGreaterThanOrEqual(51)
  })
})
