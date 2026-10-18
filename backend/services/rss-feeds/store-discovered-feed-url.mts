import { isHttpError } from 'http-errors'
import { addUrl } from '@services/urls'
import { normalizeUrlForUrlTable } from '@modules/utils/urls'

/** Treat permanent URL-policy rejections as a failed discovery, while retrying storage failures. */
export async function storeDiscoveredFeedUrl(feedUrl: string): Promise<string | null> {
  const normalizedFeedUrl = normalizeDiscoveredFeedUrl(feedUrl)
  if (!normalizedFeedUrl) return null
  try {
    const discovered = await addUrl(null, normalizedFeedUrl, {
      preserveHttp: new URL(normalizedFeedUrl).protocol === 'http:',
      skipCreatedEvents: true,
    })
    if (!discovered) throw new Error('Discovered feed URL could not be stored')
    return discovered.id
  } catch (err) {
    if (isHttpError(err) && (err.status === 400 || err.status === 422)) return null
    throw err
  }
}

/** Returns null when the canonical URL registry rejects a discovered feed URL. */
function normalizeDiscoveredFeedUrl(feedUrl: string): string | null {
  try {
    const preserveHttp = new URL(feedUrl).protocol === 'http:'
    return normalizeUrlForUrlTable(feedUrl, { preserveHttp }).toString()
  } catch {
    return null
  }
}
