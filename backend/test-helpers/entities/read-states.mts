import { read } from '@data-stores/psql'
import type { ReadStateEntityType } from '@voucha/types/entities/read-state'

const READ_STATE_STORAGE = {
  rss_feed_item: { table: 'rss_feed_item_read_states', column: 'rss_feed_item_id' },
  post: { table: 'post_read_states', column: 'post_id' },
} as const satisfies Record<ReadStateEntityType, { table: string; column: string }>

export async function readStateExists(
  userId: string,
  type: ReadStateEntityType,
  entityId: string,
): Promise<boolean> {
  const { table, column } = READ_STATE_STORAGE[type]
  const { rows } = await read(
    `/* testReadStates */ SELECT 1 FROM ${table} WHERE user_id = $1 AND ${column} = $2`,
    [userId, entityId],
  )
  return rows.length > 0
}
