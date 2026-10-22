import { Readable, Transform, compose } from 'node:stream'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { fetch } from 'undici'
import { HttpResponseSizeError } from '@modules/on-error/errors'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'

type CachedHeaders = {
  etag: string | null
  lastModified: string | null
}

/** A list read. Validators are cached only once the caller has admitted the entries it holds. */
export type FeedListRead = {
  stream: Readable
  commitValidators: () => Promise<void>
}

const FETCH_TIMEOUT_MS = 30_000
const MAX_FEED_LIST_BYTES = 10 * 1024 * 1024

const headerCache = new ValkeyCache({
  prefix: 'kagi-smallweb-etag',
  ttlSeconds: 48 * 3600, // 48 hours — outlives the daily schedule
  mode: 'json',
})

/* no-mistakes: integration=http */
export async function fetchFeedList(
  name: string,
  url: string,
  options: { conditional?: boolean } = {},
): Promise<FeedListRead | null> {
  // A continuation that already has this run's file does not call fetch. A continuation that
  // has no file still needs the lists, and it never asks for "not modified".
  const cached =
    options.conditional === false ? null : ((await headerCache.get(name)) as CachedHeaders | null)

  const headers: Record<string, string> = { 'Accept-Encoding': 'gzip, deflate, br' }
  if (cached?.etag) headers['If-None-Match'] = cached.etag
  if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified

  const response = await fetch(url, {
    dispatcher: getExternalRequestDispatcher(),
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  })

  if (response.status === 304) return null
  // An error status is a failed read, distinct from the `null` of "not modified": the caller
  // retries a page that missed a list instead of treating the list as unchanged.
  if (!response.ok) {
    throw new Error(`Failed to fetch ${name}: ${response.status} ${response.statusText}`)
  }

  const validators: CachedHeaders = {
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  }
  return {
    stream: cappedFeedListStream(response, url),
    // Caching before the page is admitted would let a failed admission hide the list behind a 304.
    // A continuation never advances the validator: the next root must still see this snapshot.
    commitValidators: async () => {
      if (options.conditional !== false) await headerCache.set(name, validators)
    },
  }
}

/** Drops the cached validators so the next read of these lists is unconditional. */
export async function forgetFeedListValidators(names: readonly string[]): Promise<void> {
  await headerCache.delete(...names)
}

function cappedFeedListStream(response: globalThis.Response, url: string): Readable {
  if (!response.body) return Readable.from([])
  let seen = 0
  const cap = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      seen += chunk.length
      if (seen > MAX_FEED_LIST_BYTES) {
        callback(new HttpResponseSizeError(url, seen, MAX_FEED_LIST_BYTES))
        return
      }
      callback(null, chunk)
    },
  })
  // compose forwards source errors and destroys the download if the cap fails.
  return compose(
    Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>),
    cap,
  )
}
