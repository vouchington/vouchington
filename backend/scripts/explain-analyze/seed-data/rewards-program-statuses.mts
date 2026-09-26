import { beginTransaction } from '@data-stores/psql'
import { contentHash, seedUuid } from './common.mts'

export const REWARDS_PROGRAM_STATUS_SEED_COUNT = 10_000
export const REWARDS_PROGRAM_STATUS_SEED_OWNER_COUNT = 100

export async function seedRewardsProgramStatuses(
  count = REWARDS_PROGRAM_STATUS_SEED_COUNT,
): Promise<void> {
  console.log(`Seeding ${count} rewards program statuses...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    const statusIds = Array.from(
      { length: Math.ceil(count / REWARDS_PROGRAM_STATUS_SEED_OWNER_COUNT) },
      (_, index) => seedUuid(index, '1f'),
    )
    const topicValues = statusIds.flatMap((id, index) => [
      id,
      `Seed rewards status ${index}`,
      `seed-rewards-status-${index}`,
      contentHash(`seed-rewards-status-${index}`),
    ])
    const topicRows = statusIds.map(
      (_, index) => `($${index * 4 + 1}, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4}, 'system')`,
    )
    await query(
      `/* seedExplainData */ INSERT INTO topics
         (id, name, slug, bedrock_nova_multimodal_v1_content_sha256, created_via)
       VALUES ${topicRows.join(', ')}
       ON CONFLICT DO NOTHING`,
      topicValues,
    )
    await query(
      `/* seedExplainData */ INSERT INTO topics__rewards_program_statuses (topic_id)
       SELECT id FROM UNNEST($1::UUID[]) AS id
       ON CONFLICT DO NOTHING`,
      [statusIds],
    )
    for (let i = 0; i < count; i += 500) {
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < Math.min(500, count - i); j++) {
        const index = i + j
        values.push(
          seedUuid(index, '1e'),
          seedUuid(index % REWARDS_PROGRAM_STATUS_SEED_OWNER_COUNT, '1b'),
          seedUuid(Math.floor(index / REWARDS_PROGRAM_STATUS_SEED_OWNER_COUNT), '1f'),
        )
        const base = values.length - 2
        rows.push(`($${base}, $${base + 1}, $${base + 2})`)
      }
      await query(
        `/* seedExplainData */ INSERT INTO individual_rewards_program_statuses
           (id, individual_id, rewards_program_status_id)
         VALUES ${rows.join(', ')}
         ON CONFLICT (id) DO UPDATE
         SET individual_id = EXCLUDED.individual_id,
             rewards_program_status_id = EXCLUDED.rewards_program_status_id`,
        values,
      )
    }

    await transaction.commit()
  }
}
