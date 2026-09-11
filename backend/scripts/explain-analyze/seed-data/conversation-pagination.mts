import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export async function seedConversationPaginationRows(count = 1000): Promise<void> {
  console.log(`Seeding ${count} direct-message and ${count} modmail inbox rows...`)
  const inboxUserId = seedUuid(0, '01')
  const communityId = seedUuid(0, '14')

  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let offset = 0; offset < count; offset += 500) {
      const batch = Math.min(500, count - offset)
      const directValues: unknown[] = []
      const directRows: string[] = []
      const modmailValues: unknown[] = []
      const modmailRows: string[] = []
      for (let index = offset; index < offset + batch; index += 1) {
        const updatedAt = new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString()
        directValues.push(seedUuid(index, '0c'), inboxUserId, updatedAt)
        let base = directValues.length - 2
        directRows.push(`($${base}, 'direct_message', $${base + 1}, $${base + 2})`)

        modmailValues.push(
          seedUuid(index, '0d'),
          communityId,
          seedUuid(index + 1, '01'),
          inboxUserId,
          updatedAt,
        )
        base = modmailValues.length - 4
        modmailRows.push(
          `($${base}, 'modmail', $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`,
        )
      }
      await query(
        `/* seedExplainData */ INSERT INTO conversations (id, channel_type, created_by_id, updated_at)
         VALUES ${directRows.join(', ')} ON CONFLICT DO NOTHING`,
        directValues,
      )
      await query(
        `/* seedExplainData */ INSERT INTO conversations (
           id, channel_type, community_id, subject_user_id, created_by_id, updated_at
         ) VALUES ${modmailRows.join(', ')} ON CONFLICT DO NOTHING`,
        modmailValues,
      )
    }

    await transaction.commit()
  }

  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let offset = 0; offset < count; offset += 500) {
      const batch = Math.min(500, count - offset)
      const values: unknown[] = []
      const rows: string[] = []
      for (let index = offset; index < offset + batch; index += 1) {
        values.push(seedUuid(index, '0c'), inboxUserId)
        const base = values.length - 1
        rows.push(`($${base}, $${base + 1}, 'owner')`)
      }
      await query(
        `/* seedExplainData */ INSERT INTO conversation_participants (
           conversation_id, user_id, role
         ) VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
    }

    await transaction.commit()
  }
}
