import { isUUID } from '@modules/utils'
import { getRssFeedsByReferenceBatch } from '@services/rss-feeds/resolve-references'
import { validateRssFeedUrl } from '@services/user-import-export/validate-rss-feed-url'

export type RssFeedReference = { id: string; slug: null }

type Entry =
  | { kind: 'id'; value: string; order: number }
  | { kind: 'url'; value: string; order: number; priority: number }

/** RSS feed id or URL. `http` is also tried as `https` in the same statement. */
export async function resolveRssFeeds(
  references: readonly string[],
): Promise<Array<RssFeedReference | null>> {
  const entries = references.flatMap((reference, order): Entry[] => {
    const trimmed = reference.trim()
    if (!trimmed) return []
    if (isUUID(trimmed)) return [{ kind: 'id', value: trimmed, order }]
    const validated = validateRssFeedUrl(trimmed)
    if (!validated.valid) return []
    const httpsFallback = validated.canonicalUrl.startsWith('http://')
      ? validateRssFeedUrl(validated.canonicalUrl.replace(/^http:\/\//, 'https://'))
      : undefined
    return [
      { kind: 'url', value: validated.canonicalUrl, order, priority: 0 },
      ...(httpsFallback?.valid
        ? [{ kind: 'url', value: httpsFallback.canonicalUrl, order, priority: 1 } satisfies Entry]
        : []),
    ]
  })
  const idRefs = entries.filter(entry => entry.kind === 'id')
  const urlRefs = entries.filter(entry => entry.kind === 'url')
  return getRssFeedsByReferenceBatch(
    {
      ids: idRefs.map(entry => entry.value),
      idOrders: idRefs.map(entry => entry.order),
      urls: urlRefs.map(entry => entry.value),
      urlOrders: urlRefs.map(entry => entry.order),
      urlPriorities: urlRefs.map(entry => entry.priority),
    },
    references.length,
  )
}
