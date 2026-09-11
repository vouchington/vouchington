import { ValkeyCache } from '@data-stores/valkey/cache'
import onError from '@modules/on-error'
import { fetch } from 'undici'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'
import { readResponseBody } from '@modules/utils/http'

type CachedHeaders = {
  etag: string | null
  lastModified: string | null
}

const FETCH_TIMEOUT_MS = 30_000
const MAX_FEED_LIST_BYTES = 10 * 1024 * 1024

const headerCache = new ValkeyCache<string>({
  prefix: 'kagi-smallweb-etag',
  ttlSeconds: 48 * 3600, // 48 hours — outlives the daily schedule
  mode: 'json',
})

/* no-mistakes: integration=http */
export async function fetchFeedList(name: string, url: string): Promise<string | null> {
  const cached = (await headerCache.get(name)) as CachedHeaders | null

  const headers: Record<string, string> = {
    'Accept-Encoding': 'gzip, deflate, br',
  }
  if (cached?.etag) headers['If-None-Match'] = cached.etag
  if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified

  const response = await fetch(url, {
    dispatcher: getExternalRequestDispatcher(),
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  })

  if (response.status === 304) return null

  if (!response.ok) {
    onError(new Error(`Failed to fetch ${name}: ${response.status} ${response.statusText}`))
    return null
  }

  const text = response.body
    ? await readResponseBody({
        response,
        url,
        maxSizeBytes: MAX_FEED_LIST_BYTES,
      })
    : ''

  const newHeaders: CachedHeaders = {
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  }
  await headerCache.set(name, newHeaders)

  return text
}
