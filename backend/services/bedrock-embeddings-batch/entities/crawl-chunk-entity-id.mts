import { isUUID } from '@modules/utils'

export const createCrawlChunkEntityId = (crawlId: string, orderIndex: number): string =>
  `${crawlId}-${orderIndex}`

/**
 * Parses a crawl chunk entity ID into its components
 * Returns null if the ID is malformed
 */
export const parseCrawlChunkEntityId = (
  entityId: string,
): { crawlId: string; orderIndex: number } | null => {
  const parts = entityId.split('-')
  if (parts.length !== 6) return null // UUID(5 parts)-number(1 part) = 6 parts

  const crawlId = parts.slice(0, 5).join('-') // First 5 parts form the crawl ID
  if (!isUUID(crawlId)) return null

  const orderIndexText = parts[5]
  if (!/^\d+$/.test(orderIndexText)) return null

  const orderIndex = Number(orderIndexText)
  if (!Number.isSafeInteger(orderIndex) || orderIndex > 2147483647) return null

  return { crawlId, orderIndex }
}
