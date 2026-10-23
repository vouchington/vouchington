import { getRssFeedItemsWorkLimit } from './work-limits.mts'

/** Keeps every item's category rows in one chunk and orders chunks by item ID. */
export function orderedCategoryChunks<T extends { rss_feed_item_id: string }>(
  rows: readonly T[],
): T[][] {
  const RSS_FEED_ITEM_CATEGORY_SQL_BATCH_SIZE = getRssFeedItemsWorkLimit('category_sql_batch_size')
  const rowsByItemId = new Map<string, T[]>()
  for (const row of rows) {
    const itemRows = rowsByItemId.get(row.rss_feed_item_id) ?? []
    itemRows.push(row)
    rowsByItemId.set(row.rss_feed_item_id, itemRows)
  }
  const chunks: T[][] = []
  let chunk: T[] = []
  for (const [, itemRows] of [...rowsByItemId].toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (
      chunk.length > 0 &&
      chunk.length + itemRows.length > RSS_FEED_ITEM_CATEGORY_SQL_BATCH_SIZE
    ) {
      chunks.push(chunk)
      chunk = []
    }
    chunk.push(...itemRows)
  }
  if (chunk.length > 0) chunks.push(chunk)
  return chunks
}
