import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const INDIVIDUAL_CARD_SEED_COUNT = 10_000
export const INDIVIDUAL_CARD_SEED_OWNER_COUNT = 100

export async function seedIndividualCards(count = INDIVIDUAL_CARD_SEED_COUNT): Promise<void> {
  console.log(`Seeding ${count} individual cards...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    const ownerCount = Math.min(INDIVIDUAL_CARD_SEED_OWNER_COUNT, count)
    const ownerValues: unknown[] = []
    const ownerRows: string[] = []
    for (let owner = 0; owner < ownerCount; owner++) {
      ownerValues.push(seedUuid(owner, '1b'))
      ownerRows.push(`($${ownerValues.length})`)
    }
    await query(
      `/* seedExplainData */ INSERT INTO individuals (id)
       VALUES ${ownerRows.join(', ')}
       ON CONFLICT DO NOTHING`,
      ownerValues,
    )
    await query(
      `/* seedExplainData */ UPDATE users
       SET individual_id = individuals.id
       FROM (VALUES ${Array.from(
         { length: ownerCount },
         (_, owner) => `($${owner * 2 + 1}::UUID, $${owner * 2 + 2}::UUID)`,
       ).join(', ')}) AS individuals(user_id, id)
       WHERE users.id = individuals.user_id`,
      Array.from({ length: ownerCount }, (_, owner) => [
        seedUuid(owner, '01'),
        seedUuid(owner, '1b'),
      ]).flat(),
    )

    for (let i = 0; i < count; i += 500) {
      const batch = Math.min(500, count - i)
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < batch; j++) {
        const idx = i + j
        values.push(
          seedUuid(idx, '1c'),
          seedUuid(idx % ownerCount, '1b'),
          seedUuid(idx % 2500, '04'),
        )
        const base = values.length - 2
        rows.push(`($${base}, $${base + 1}, $${base + 2})`)
      }
      await query(
        `/* seedExplainData */ INSERT INTO individual_cards (id, individual_id, card_id)
         VALUES ${rows.join(', ')}
         ON CONFLICT (id) DO UPDATE
         SET individual_id = EXCLUDED.individual_id,
             card_id = EXCLUDED.card_id`,
        values,
      )
    }

    await transaction.commit()
  }
}
