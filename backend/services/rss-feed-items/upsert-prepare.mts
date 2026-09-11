import { createRssFeedItemEmbeddingContent } from './content.mts'
import { sanitizeRssFeedItemDates } from './dates.mts'
import type { RssFeedItemToUpsert } from './types.mts'
import { isPublicHostname, normalizeUrlForUrlTable } from '@modules/utils/urls'
import { addUrls } from '@services/urls'
import onError from '@modules/on-error'
import createHttpError from 'http-errors'
import {
  chunkArray,
  normalizeRssFeedItemCategories,
  RSS_FEED_ITEM_SQL_BATCH_SIZE,
} from './processing-limits.mts'

export type RssFeedItemWithHash = {
  feedItem: RssFeedItemToUpsert
  content_sha256: Buffer
  url_id: string
}

export const prepareRssFeedItemsForUpsert = async (feedItems: RssFeedItemToUpsert[]) => {
  const sanitizedFeedItems: RssFeedItemToUpsert[] = feedItems.map(feedItem => {
    const sanitized = sanitizeRssFeedItemDates(feedItem)
    const categories = normalizeRssFeedItemCategories(sanitized.categories)
    return {
      ...sanitized,
      categories: sanitized.categories === undefined ? undefined : categories,
    }
  })

  // Normalize links using the same helper addUrls uses internally. Items whose
  // link fails normalization (invalid URL, non-https) are skipped gracefully.
  const normalizedLinks: (string | null)[] = sanitizedFeedItems.map(feedItem => {
    try {
      const url = normalizeUrlForUrlTable(feedItem.link)
      // Mirrors the isPublicHostname guard inside addUrls — pre-filtering
      // here prevents a spurious 500 log when addUrls silently drops the same hosts.
      return isPublicHostname(url.hostname) ? url.toString() : null
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
      return null
    }
  })

  const validLinks = normalizedLinks.filter((link): link is string => link !== null)
  const uniqueLinks = [...new Set(validLinks)]
  const urlChunks = chunkArray(uniqueLinks, RSS_FEED_ITEM_SQL_BATCH_SIZE)
  const urls: Awaited<ReturnType<typeof addUrls>> = []
  for (const chunk of urlChunks) {
    // eslint-disable-next-line no-await-in-loop -- Sequential URL chunks limit write pressure.
    urls.push(...(await addUrls(null, chunk)))
  }
  const urlMap = new Map(urls.map(u => [u.url, u.id]))

  const itemsWithHashesOrNull = await Promise.all(
    sanitizedFeedItems.map(async (feedItem, index) => {
      const normalizedLink = normalizedLinks[index]
      if (normalizedLink === null) return null
      const url_id = urlMap.get(normalizedLink)
      if (!url_id) {
        onError(
          createHttpError(
            500,
            `url_id missing after addUrls for link: ${feedItem.link} (normalized: ${normalizedLink})`,
          ),
        )
        return null
      }
      const { content_sha256 } = await createRssFeedItemEmbeddingContent(feedItem)
      return { feedItem, content_sha256, url_id }
    }),
  )

  return itemsWithHashesOrNull.filter((item): item is RssFeedItemWithHash => item !== null)
}
