import { advisoryLockPool, type PoolClient } from '@data-stores/psql'

export const RSS_CATEGORY_SNAPSHOT_LOCK_NAMESPACE = 0x5253

/** Serializes complete category snapshots for each RSS item across pooled DB sessions. */
export async function withRssFeedItemCategorySnapshotLocks<Result>(
  rssFeedItemIds: readonly string[],
  operation: () => Promise<Result>,
): Promise<Result> {
  const itemIds = [...new Set(rssFeedItemIds)].toSorted()
  if (itemIds.length === 0) return operation()
  const client = await advisoryLockPool.connect()
  let released = false
  let operationError: Error | undefined
  let result: Result | undefined

  try {
    await client.query(
      `/* withRssFeedItemCategorySnapshotLocks.lock */
        SELECT pg_advisory_lock($1, hashtext(rss_feed_item_id::text))
        FROM unnest($2::uuid[]) AS input(rss_feed_item_id)
        ORDER BY rss_feed_item_id`,
      [RSS_CATEGORY_SNAPSHOT_LOCK_NAMESPACE, itemIds],
    )
    try {
      result = await operation()
    } catch (error) {
      operationError = toError(error)
    }
    const unlockError = await unlockCategorySnapshotLocks(client, itemIds)
    if (unlockError) {
      client.release(true)
      released = true
      if (operationError) {
        operationError.cause ??= unlockError
        throw operationError
      }
      throw unlockError
    }
    client.release()
    released = true
    if (operationError) throw operationError
    return result as Result
  } catch (error) {
    if (!released) client.release(true)
    throw toError(error)
  }
}

async function unlockCategorySnapshotLocks(
  client: PoolClient,
  itemIds: string[],
): Promise<Error | undefined> {
  try {
    const { rows } = await client.query<{ unlocked: boolean }>(
      `/* withRssFeedItemCategorySnapshotLocks.unlock */
        SELECT pg_advisory_unlock($1, hashtext(rss_feed_item_id::text)) AS unlocked
        FROM unnest($2::uuid[]) AS input(rss_feed_item_id)
        ORDER BY rss_feed_item_id`,
      [RSS_CATEGORY_SNAPSHOT_LOCK_NAMESPACE, itemIds],
    )
    if (rows.some(row => !row.unlocked))
      return new Error('RSS feed item category snapshot advisory lock was not held at release')
    return undefined
  } catch (error) {
    return toError(error)
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
