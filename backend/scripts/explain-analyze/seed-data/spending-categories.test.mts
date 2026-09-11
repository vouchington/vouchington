import { describe, expect, it } from 'vitest'
import {
  HOUSEHOLD_SPENDING_CATEGORY_SEED_COUNT,
  SPENDING_CATEGORY_SEED_COUNT,
  SPENDING_CATEGORY_SEED_OWNER_COUNT,
  spendingEntrySeedRow,
  spendingEntryUpsertSql,
} from './spending-categories.mts'

describe('spending-category EXPLAIN seed shape', () => {
  it('models an interleaved multi-owner second page', () => {
    expect(SPENDING_CATEGORY_SEED_OWNER_COUNT).toBeGreaterThanOrEqual(100)
    expect(SPENDING_CATEGORY_SEED_COUNT % SPENDING_CATEGORY_SEED_OWNER_COUNT).toBe(0)
    expect(
      SPENDING_CATEGORY_SEED_COUNT / SPENDING_CATEGORY_SEED_OWNER_COUNT,
    ).toBeGreaterThanOrEqual(51)
  })

  it('models high-cardinality household ownership and member visibility', () => {
    expect(HOUSEHOLD_SPENDING_CATEGORY_SEED_COUNT).toBeGreaterThanOrEqual(10_000)
    expect(HOUSEHOLD_SPENDING_CATEGORY_SEED_COUNT % SPENDING_CATEGORY_SEED_OWNER_COUNT).toBe(0)
    expect(
      HOUSEHOLD_SPENDING_CATEGORY_SEED_COUNT / SPENDING_CATEGORY_SEED_OWNER_COUNT,
    ).toBeGreaterThanOrEqual(51)
  })

  it.each([
    ['individual_id', 'personal', 150],
    ['household_id', 'household', 250],
  ] as const)(
    'uses canonical integer Money values and columns for %s seeds',
    (ownerColumn, ownership, expectedMinorUnits) => {
      const row = spendingEntrySeedRow(1, ownership)
      const sql = spendingEntryUpsertSql(ownerColumn, [row])

      expect(sql).toContain(
        `(id, ${ownerColumn}, spending_category_id, amount_minor_units, currency_code)`,
      )
      expect(sql).toContain(`VALUES ($1, $2, $3, ${expectedMinorUnits}, 'usd')`)
      expect(sql).toContain('amount_minor_units = EXCLUDED.amount_minor_units')
      expect(sql).toContain('currency_code = EXCLUDED.currency_code')
      expect(sql).not.toMatch(/\bamount\b/)
    },
  )
})
