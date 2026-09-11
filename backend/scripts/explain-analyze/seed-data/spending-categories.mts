import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const SPENDING_CATEGORY_SEED_COUNT = 10_000
export const SPENDING_CATEGORY_SEED_OWNER_COUNT = 100
export const HOUSEHOLD_SPENDING_CATEGORY_SEED_COUNT = 10_000
const SPENDING_ENTRY_SEED_MINOR_UNITS = { personal: 150, household: 250 } as const

export async function seedSpendingCategories(
  count = SPENDING_CATEGORY_SEED_COUNT,
  householdCount = HOUSEHOLD_SPENDING_CATEGORY_SEED_COUNT,
): Promise<void> {
  console.log(`Seeding ${count} personal and ${householdCount} household spending categories...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    const ownerCount = Math.min(SPENDING_CATEGORY_SEED_OWNER_COUNT, count)
    const categoryCount = Math.ceil(Math.max(count, householdCount) / ownerCount)
    const categoryIds = Array.from({ length: categoryCount }, (_, index) => seedUuid(index, '04'))

    await query(
      `/* seedExplainData */ INSERT INTO topics__spending_categories (topic_id)
       SELECT id FROM UNNEST($1::UUID[]) AS id
       ON CONFLICT DO NOTHING`,
      [categoryIds],
    )

    const householdValues: unknown[] = []
    const householdRows: string[] = []
    for (let owner = 0; owner < ownerCount; owner++) {
      householdValues.push(seedUuid(owner, '20'), seedUuid(owner, '01'))
      const base = householdValues.length - 1
      householdRows.push(`($${base}, $${base + 1})`)
    }
    await query(
      `/* seedExplainData */ INSERT INTO households (id, owner_id)
       VALUES ${householdRows.join(', ')}
       ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id`,
      householdValues,
    )
    const membershipValues: unknown[] = []
    const membershipRows: string[] = []
    for (let owner = 0; owner < ownerCount; owner++) {
      membershipValues.push(seedUuid(owner, '20'), seedUuid(owner, '1b'))
      const base = membershipValues.length - 1
      membershipRows.push(`($${base}, $${base + 1})`)
    }
    membershipValues.push(seedUuid(1, '20'), seedUuid(0, '1b'))
    membershipRows.push(`($${membershipValues.length - 1}, $${membershipValues.length})`)
    await query(
      `/* seedExplainData */ INSERT INTO household_members (household_id, individual_id)
       VALUES ${membershipRows.join(', ')}
       ON CONFLICT ON CONSTRAINT uniq_household_members__household_id_individual_id DO NOTHING`,
      membershipValues,
    )

    for (let i = 0; i < count; i += 500) {
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < Math.min(500, count - i); j++) {
        const index = i + j
        values.push(
          seedUuid(index, '1e'),
          seedUuid(index % ownerCount, '1b'),
          seedUuid(Math.floor(index / ownerCount), '04'),
        )
        const base = values.length - 2
        rows.push(spendingEntrySeedRow(base, 'personal'))
      }
      await query(spendingEntryUpsertSql('individual_id', rows), values)
    }

    for (let i = 0; i < householdCount; i += 500) {
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < Math.min(500, householdCount - i); j++) {
        const index = i + j
        values.push(
          seedUuid(index, '1f'),
          seedUuid(index % ownerCount, '20'),
          seedUuid(Math.floor(index / ownerCount), '04'),
        )
        const base = values.length - 2
        rows.push(spendingEntrySeedRow(base, 'household'))
      }
      await query(spendingEntryUpsertSql('household_id', rows), values)
    }

    await transaction.commit()
  }
}

export function spendingEntrySeedRow(
  parameterBase: number,
  ownership: keyof typeof SPENDING_ENTRY_SEED_MINOR_UNITS,
): string {
  const minorUnits = SPENDING_ENTRY_SEED_MINOR_UNITS[ownership]
  return `($${parameterBase}, $${parameterBase + 1}, $${parameterBase + 2}, ${minorUnits}, 'usd')`
}

export function spendingEntryUpsertSql(
  ownerColumn: 'individual_id' | 'household_id',
  rows: string[],
): string {
  return `/* seedExplainData */ INSERT INTO spending_entries
           (id, ${ownerColumn}, spending_category_id, amount_minor_units, currency_code)
         VALUES ${rows.join(', ')}
         ON CONFLICT (id) DO UPDATE
         SET ${ownerColumn} = EXCLUDED.${ownerColumn},
             spending_category_id = EXCLUDED.spending_category_id,
             amount_minor_units = EXCLUDED.amount_minor_units,
             currency_code = EXCLUDED.currency_code`
}
