import { beginTransaction } from '@data-stores/psql'
import { contentHash, seedUuid } from './common.mts'

export async function seedUserRemovedPlatformPosts(count = 2000): Promise<void> {
  console.log(`Seeding ${count} owner-scoped platform removals...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let i = 0; i < count; i += 500) {
      const batch = Math.min(500, count - i)
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < batch; j++) {
        const idx = i + j
        const id = seedUuid(idx, '18')
        const title = `Seed Removed Post ${idx}`
        const markdown = `Removed content for explain seed ${idx}`
        const hash = contentHash(`removed-post-${idx}`)
        const rejectedAt = new Date(Date.UTC(2026, 0, 1) + idx * 1000).toISOString()
        values.push(id, title, markdown, seedUuid(0, '01'), hash, rejectedAt)
        const base = values.length - 5
        rows.push(
          `($${base}, 'discussion', $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 4}, $${base + 5}::timestamptz)`,
        )
      }
      await query(
        `/* seedExplainData */ INSERT INTO posts (
          id, post_type, title, markdown, created_by_id,
          bedrock_nova_multimodal_v1_content_sha256,
          llm_moderation_content_sha256,
          rejected_at
        ) VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
    }

    await transaction.commit()
  }
}
