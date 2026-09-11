import { write } from '@data-stores/psql'
import assert from 'http-assert'
import type { ReadStateEntityType } from './types.mts'

export async function markRead(
  currentUserId: string,
  type: ReadStateEntityType,
  entityId: string,
): Promise<void> {
  const query = markReadSql(type)
  await write(query, [currentUserId, entityId]).catch((error: unknown) => {
    if ((error as { code?: string }).code === '23503') {
      assert(false, 404, 'Target entity not found')
    }
    throw error
  })
}

export async function markUnread(
  currentUserId: string,
  type: ReadStateEntityType,
  entityId: string,
): Promise<void> {
  const query = markUnreadSql(type)
  await write(query, [currentUserId, entityId])
}

function markReadSql(type: ReadStateEntityType): string {
  switch (type) {
    case 'rss_feed_item':
      return `/* markRead:rssFeedItem */
        INSERT INTO rss_feed_item_read_states (user_id, rss_feed_item_id, read_at)
        VALUES ($1, $2, now())
        ON CONFLICT DO NOTHING`
    case 'post':
      return `/* markRead:post */
        INSERT INTO post_read_states (user_id, post_id, read_at)
        VALUES ($1, $2, now())
        ON CONFLICT DO NOTHING`
    default:
      return assertNeverReadStateEntityType(type)
  }
}

function markUnreadSql(type: ReadStateEntityType): string {
  switch (type) {
    case 'rss_feed_item':
      return `/* markUnread:rssFeedItem */
        DELETE FROM rss_feed_item_read_states
        WHERE user_id = $1 AND rss_feed_item_id = $2`
    case 'post':
      return `/* markUnread:post */
        DELETE FROM post_read_states
        WHERE user_id = $1 AND post_id = $2`
    default:
      return assertNeverReadStateEntityType(type)
  }
}

function assertNeverReadStateEntityType(type: never): never {
  throw new Error(`Unknown read state entity type: ${String(type)}`)
}
