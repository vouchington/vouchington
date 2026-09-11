import { normalizeHashtag } from '@ts-shared/utils'
import type { RssFeedItemCategoryInput } from '@voucha/types/entities/rss-feed-item'
import {
  chunkArray,
  normalizeRssFeedItemCategories,
  RSS_FEED_ITEM_CATEGORY_SQL_BATCH_SIZE,
} from './processing-limits.mts'

type RssFeedItemCategorySqlInput = {
  rss_feed_item_id: string
  category: string
  hashtag_alias: string | null
}

export type RssFeedItemCategorySnapshot = {
  rss_feed_item_id: string
  categories: string[]
}

export function normalizeRssFeedItemCategorySnapshots(
  items: RssFeedItemCategoryInput[],
): RssFeedItemCategorySnapshot[] {
  const snapshots = new Map<string, RssFeedItemCategorySnapshot>()
  for (const item of items) {
    snapshots.set(item.rss_feed_item_id, {
      rss_feed_item_id: item.rss_feed_item_id,
      categories: normalizeRssFeedItemCategories(item.categories),
    })
  }
  return [...snapshots.values()]
}

export function buildRssFeedItemCategorySqlBatches(
  items: RssFeedItemCategoryInput[],
): RssFeedItemCategorySqlInput[][] {
  const allCategories: RssFeedItemCategorySqlInput[] = []
  for (const item of normalizeRssFeedItemCategorySnapshots(items)) {
    for (const category of item.categories) {
      allCategories.push({
        rss_feed_item_id: item.rss_feed_item_id,
        category,
        hashtag_alias: normalizeHashtag(category)?.key ?? null,
      })
    }
  }
  return chunkArray(allCategories, RSS_FEED_ITEM_CATEGORY_SQL_BATCH_SIZE)
}
