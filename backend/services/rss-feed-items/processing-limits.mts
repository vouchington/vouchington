import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const RSS_FEED_FETCH_MAX_ITEMS = 500
export const RSS_FEED_ITEM_MAX_CATEGORIES = 20

export const rssFeedItemIngestionMaxValues = {
  fetch_max_items: RSS_FEED_FETCH_MAX_ITEMS,
  item_max_categories: RSS_FEED_ITEM_MAX_CATEGORIES,
  podcast_chapters_max_count: 200,
}

export const rssFeedItemIngestionConfig = new DynamicConfig({
  key: 'rss-feed-item-ingestion-config',
  fieldTypes: {
    fetch_max_items: 'number',
    item_max_categories: 'number',
    podcast_chapters_max_count: 'number',
  },
  defaultFields: rssFeedItemIngestionMaxValues,
})

export function getRssFeedItemIngestionLimit(
  field: keyof typeof rssFeedItemIngestionMaxValues,
): number {
  return getBoundedPositiveIntegerField(rssFeedItemIngestionConfig, field, {
    defaultValue: rssFeedItemIngestionMaxValues[field],
    maxValue: rssFeedItemIngestionMaxValues[field],
  })
}

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
  categoryCap = getRssFeedItemIngestionLimit('item_max_categories'),
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
  const normalized = unique.slice(0, categoryCap)

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
