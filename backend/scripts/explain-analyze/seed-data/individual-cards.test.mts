import { describe, expect, it } from 'vitest'
import {
  INDIVIDUAL_CARD_SEED_COUNT,
  INDIVIDUAL_CARD_SEED_OWNER_COUNT,
} from './individual-cards.mts'

describe('individual-card EXPLAIN seed shape', () => {
  it('models an interleaved multi-owner second page', () => {
    expect(INDIVIDUAL_CARD_SEED_OWNER_COUNT).toBeGreaterThanOrEqual(100)
    expect(INDIVIDUAL_CARD_SEED_COUNT % INDIVIDUAL_CARD_SEED_OWNER_COUNT).toBe(0)
    expect(INDIVIDUAL_CARD_SEED_COUNT / INDIVIDUAL_CARD_SEED_OWNER_COUNT).toBeGreaterThanOrEqual(51)
  })
})
