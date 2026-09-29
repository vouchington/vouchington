import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export async function seedNotifications(count = 500): Promise<void> {
  console.log(`Seeding ${count} notifications...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let i = 0; i < count; i += 500) {
      const batch = Math.min(500, count - i)
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < batch; j++) {
        const idx = i + j
        const userId = seedUuid(0, '01')
        const postId = seedUuid(idx % 100_000, '05')
        values.push(
          userId,
          'post',
          postId,
          `Seed notification ${idx}`,
          `Body for notification ${idx}`,
          `/posts/seed-${idx}`,
        )
        const base = values.length - 5
        rows.push(
          `($${base}, $${base + 1}::notification_entity_types, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`,
        )
      }
      await query(
        `/* seedExplainData */ INSERT INTO notifications (user_id, entity_type, post_id, title, body, target_path) VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
    }

    await transaction.commit()
  }
}
export async function seedConversations(messageCount = 100): Promise<void> {
  console.log(`Seeding 1 conversation and ${messageCount} messages...`)
  const conversationId = seedUuid(0, '0b')
  const createdById = seedUuid(0, '01')
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(
      `/* seedExplainData */ INSERT INTO conversations (id, created_by_id, title) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [conversationId, createdById, 'Seed Conversation'],
    )

    await transaction.commit()
  }
  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let i = 0; i < messageCount; i += 500) {
      const batch = Math.min(500, messageCount - i)
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < batch; j++) {
        const idx = i + j
        const msgCreatedById = seedUuid(idx % 2 === 0 ? 0 : 1, '01')
        const content = JSON.stringify({ text: `Seed message ${idx}` })
        values.push(conversationId, msgCreatedById, content)
        const base = values.length - 2
        rows.push(`($${base}, $${base + 1}, $${base + 2}::jsonb)`)
      }
      await query(
        `/* seedExplainData */ INSERT INTO conversation_messages (conversation_id, created_by_id, content) VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
    }

    await transaction.commit()
  }
}
