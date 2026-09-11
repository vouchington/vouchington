export const RSS_FEED_FETCH_MAX_ITEMS = 500
export const RSS_FEED_ITEM_MAX_CATEGORIES = 20
export const RSS_FEED_ITEM_SQL_BATCH_SIZE = 250
export const RSS_FEED_ITEM_CATEGORY_SQL_BATCH_SIZE = 1000
export const RSS_FEED_ITEM_ENQUEUE_BATCH_SIZE = 1000

export type RssFeedItemCategoryAnalysis = {
  categories: string[]
  uncappedCount: number
  truncatedCount: number
}

export function normalizeRssFeedItemCategories(categories: string[] | undefined): string[] {
  return analyzeRssFeedItemCategories(categories).categories
}

export function analyzeRssFeedItemCategories(
  categories: string[] | undefined,
): RssFeedItemCategoryAnalysis {
  const normalized: string[] = []
  const seen = new Set<string>()

  if (!categories || categories.length === 0) {
    return { categories: normalized, uncappedCount: 0, truncatedCount: 0 }
  }

  for (const category of categories) {
    const trimmed = category.trim()
    if (!trimmed) continue

    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    if (normalized.length < RSS_FEED_ITEM_MAX_CATEGORIES) {
      normalized.push(trimmed)
    }
  }

  return {
    categories: normalized,
    uncappedCount: seen.size,
    truncatedCount: Math.max(0, seen.size - normalized.length),
  }
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error('chunk size must be a positive integer')
  }

  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}
