import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const POINT_VALUATION_SEED_COUNT = 10_000
export const POINT_VALUATION_SEED_OWNER_COUNT = 100

export async function seedPointValuations(count = POINT_VALUATION_SEED_COUNT): Promise<void> {
  console.log(`Seeding ${count} point valuations...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    const rewardsProgramCount = Math.ceil(count / POINT_VALUATION_SEED_OWNER_COUNT)
    const programValues = Array.from({ length: rewardsProgramCount }, (_, index) =>
      seedUuid(index, '04'),
    )
    await query(
      `/* seedExplainData */ INSERT INTO topics__rewards_programs (topic_id)
       SELECT id FROM UNNEST($1::UUID[]) AS id
       ON CONFLICT DO NOTHING`,
      [programValues],
    )
    for (let i = 0; i < count; i += 500) {
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < Math.min(500, count - i); j++) {
        const index = i + j
        values.push(
          seedUuid(index, '1d'),
          seedUuid(index % POINT_VALUATION_SEED_OWNER_COUNT, '1b'),
          seedUuid(Math.floor(index / POINT_VALUATION_SEED_OWNER_COUNT), '04'),
        )
        const base = values.length - 2
        rows.push(`($${base}, $${base + 1}, $${base + 2}, 35000, 'usd')`)
      }
      await query(
        `/* seedExplainData */ INSERT INTO individual_rewards_program_point_valuations
           (id, individual_id, rewards_program_id, value_microunits_per_point, currency_code)
         VALUES ${rows.join(', ')}
         ON CONFLICT (id) DO UPDATE
         SET individual_id = EXCLUDED.individual_id,
             rewards_program_id = EXCLUDED.rewards_program_id,
             value_microunits_per_point = EXCLUDED.value_microunits_per_point,
             currency_code = EXCLUDED.currency_code`,
        values,
      )
    }

    await transaction.commit()
  }
}
