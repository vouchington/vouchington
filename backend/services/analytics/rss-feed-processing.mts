import { emit, type RssFeedProcessingRecord } from '@data-stores/analytics'

function makeBase(
  now: Date,
): Pick<RssFeedProcessingRecord, 'event_id' | 'event_time' | 'event_date' | 'env'> {
  return {
    event_id: crypto.randomUUID(),
    event_time: now,
    event_date: now.toISOString().slice(0, 10),
    env: process.env.NODE_ENV ?? 'development',
  }
}

export function trackRssFeedProcessingTruncated({
  rssFeedId,
  totalParsedItems,
  validItemsBeforeCap,
  returnedItems,
  itemCap,
  itemTruncatedCount,
  categoryCap,
  categoryTruncatedItemCount,
  categoryTruncatedCount,
  now = new Date(),
}: {
  rssFeedId: string
  totalParsedItems: number
  validItemsBeforeCap: number
  returnedItems: number
  itemCap: number
  itemTruncatedCount: number
  categoryCap: number
  categoryTruncatedItemCount: number
  categoryTruncatedCount: number
  now?: Date
}): void {
  emit('rss_feed_processing', {
    ...makeBase(now),
    event_type: 'truncated',
    rss_feed_id: rssFeedId,
    total_parsed_items: totalParsedItems,
    valid_items_before_cap: validItemsBeforeCap,
    returned_items: returnedItems,
    item_cap: itemCap,
    item_truncated_count: itemTruncatedCount,
    category_cap: categoryCap,
    category_truncated_item_count: categoryTruncatedItemCount,
    category_truncated_count: categoryTruncatedCount,
  })
}
