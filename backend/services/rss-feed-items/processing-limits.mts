export const RSS_FEED_FETCH_MAX_ITEMS = 500
export const RSS_FEED_ITEM_MAX_CATEGORIES = 20

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
  if (!categories || categories.length === 0) {
    return { categories: [], uncappedCount: 0, truncatedCount: 0 }
  }

  const seen = new Set<string>()
  const unique = categories.flatMap(category => {
    const trimmed = category.trim()
    if (!trimmed) return []
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return []
    seen.add(key)
    return [trimmed]
  })
  const normalized = unique.slice(0, RSS_FEED_ITEM_MAX_CATEGORIES)

  return {
    categories: normalized,
    uncappedCount: unique.length,
    truncatedCount: Math.max(0, unique.length - normalized.length),
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
