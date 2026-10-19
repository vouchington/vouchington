import { isUUID } from '@modules/utils'
import { getRssFeedsByReferenceBatch } from '@services/rss-feeds/resolve-references'
import { validateRssFeedUrl } from '@services/user-import-export/validate-rss-feed-url'

export type RssFeedReference = { id: string; slug: null }

/** RSS feed id or URL. `http` is also tried as `https` in the same statement. */
export async function resolveRssFeeds(
  references: readonly string[],
): Promise<Array<RssFeedReference | null>> {
  const ids: string[] = []
  const idOrders: number[] = []
  const urls: string[] = []
  const urlOrders: number[] = []
  const urlPriorities: number[] = []
  references.forEach((reference, index) => {
    const trimmed = reference.trim()
    if (!trimmed) return
    if (isUUID(trimmed)) {
      ids.push(trimmed)
      idOrders.push(index)
      return
    }
    const validated = validateRssFeedUrl(trimmed)
    if (!validated.valid) return
    urls.push(validated.canonicalUrl)
    urlOrders.push(index)
    urlPriorities.push(0)
    if (validated.canonicalUrl.startsWith('http://')) {
      const https = validateRssFeedUrl(validated.canonicalUrl.replace(/^http:\/\//, 'https://'))
      if (https.valid) {
        urls.push(https.canonicalUrl)
        urlOrders.push(index)
        urlPriorities.push(1)
      }
    }
  })
  return getRssFeedsByReferenceBatch(
    { ids, idOrders, urls, urlOrders, urlPriorities },
    references.length,
  )
}

export async function resolveRssFeed(reference: string): Promise<RssFeedReference | null> {
  const [feed] = await resolveRssFeeds([reference])
  return feed ?? null
}
