import { isFeedContentType, parseFeedDocument } from '@vouchington/rss-parser'
import { CRAWLER_USER_AGENT } from '@voucha/config'
import { getExternalFetch } from '@modules/utils/http-dispatchers'
import { createWriteStream } from 'node:fs'
import { mkdtempDisposable, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const TIMEOUT_MS = 10_000
const MAX_TRANSIENT_ATTEMPTS = 3
const TRANSIENT_RETRY_DELAY_MS = 500
const MAX_TRANSIENT_RETRY_DELAY_MS = 5000
// Keep this validation probe aligned with the production RSS crawler contract.
const MAX_FEED_BYTES = 10 * 1024 * 1024
const externalFetch = getExternalFetch()

class FeedTooLargeError extends Error {
  constructor() {
    super(`feed body exceeds ${MAX_FEED_BYTES} bytes`)
  }
}

export type ProbeResult =
  | { status: 'ok'; httpStatus: number; finalUrl: string }
  | { status: 'permanent'; httpStatus: number; finalUrl: string; reason: string }
  | {
      status: 'transient'
      httpStatus: number | null
      finalUrl: string
      reason: string
      retryAfterMs?: number
    }

export interface FeedEntry {
  file: string
  slug: string
  url: string
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isTransientStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429
}

function parseRetryAfterMs(retryAfter: string | null): number | undefined {
  if (!retryAfter) return undefined

  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_TRANSIENT_RETRY_DELAY_MS)
  }

  const retryAt = Date.parse(retryAfter)
  if (Number.isNaN(retryAt)) return undefined
  return Math.min(Math.max(retryAt - Date.now(), 0), MAX_TRANSIENT_RETRY_DELAY_MS)
}

function transientRetryDelayMs(
  result: Extract<ProbeResult, { status: 'transient' }>,
  attempt: number,
): number {
  if (result.retryAfterMs !== undefined) return result.retryAfterMs
  const baseDelay = TRANSIENT_RETRY_DELAY_MS * 2 ** (attempt - 1)
  const jitter = Math.floor(Math.random() * TRANSIENT_RETRY_DELAY_MS)
  return Math.min(baseDelay + jitter, MAX_TRANSIENT_RETRY_DELAY_MS)
}

async function probeUrl(url: string): Promise<ProbeResult> {
  let response: Response
  let finalUrl = url
  try {
    response = await externalFetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': CRAWLER_USER_AGENT,
        Accept:
          'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    finalUrl = response.url || url
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { status: 'transient', httpStatus: null, finalUrl: url, reason }
  }

  const httpStatus = response.status

  if (isTransientStatus(httpStatus)) {
    const retryAfterMs =
      httpStatus === 429 ? parseRetryAfterMs(response.headers.get('retry-after')) : undefined
    await response.body?.cancel()
    return { status: 'transient', httpStatus, finalUrl, reason: `HTTP ${httpStatus}`, retryAfterMs }
  }

  if (httpStatus >= 400) {
    await response.body?.cancel()
    return { status: 'permanent', httpStatus, finalUrl, reason: `HTTP ${httpStatus}` }
  }

  const contentType = response.headers.get('content-type')
  if (contentType && !isFeedContentType(contentType)) {
    await response.body?.cancel()
    return {
      status: 'permanent',
      httpStatus,
      finalUrl,
      reason: `invalid content-type: ${contentType}`,
    }
  }

  let body: Uint8Array
  try {
    body = await spoolFeedBody(response)
  } catch (error) {
    if (error instanceof FeedTooLargeError) {
      return {
        status: 'permanent',
        httpStatus,
        finalUrl,
        reason: `feed body exceeds ${MAX_FEED_BYTES} bytes`,
      }
    }
    const reason = error instanceof Error ? error.message : String(error)
    return { status: 'transient', httpStatus, finalUrl, reason }
  }

  try {
    const { feed } = parseFeedDocument(body, { contentType })
    if (!feed) {
      return {
        status: 'permanent',
        httpStatus,
        finalUrl,
        reason: 'parseFeedDocument returned no feed',
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { status: 'permanent', httpStatus, finalUrl, reason: `parseFeed failed: ${reason}` }
  }

  return { status: 'ok', httpStatus, finalUrl }
}

export async function spoolFeedBody(response: Response, tempRoot = tmpdir()): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array()
  await using directory = await mkdtempDisposable(join(tempRoot, 'voucha-rss-probe-'))
  const path = join(directory.path, 'feed')
  let bytes = 0
  const cap = new Transform({
    transform(chunk: Buffer, encoding, callback) {
      void encoding
      bytes += chunk.byteLength
      if (bytes > MAX_FEED_BYTES) {
        callback(new FeedTooLargeError())
        return
      }
      callback(null, chunk)
    },
  })
  const source = Readable.from(response.body as AsyncIterable<Uint8Array>)
  await pipeline(source, cap, createWriteStream(path))
  return await readFile(path)
}

export async function probeUrlWithRetries(url: string): Promise<ProbeResult> {
  let result: ProbeResult
  for (let attempt = 1; attempt <= MAX_TRANSIENT_ATTEMPTS; attempt++) {
    result = await probeUrl(url)
    if (result.status !== 'transient' || attempt === MAX_TRANSIENT_ATTEMPTS) return result
    await sleep(transientRetryDelayMs(result, attempt))
  }
  throw new Error('BUG: unreachable transient probe retry path')
}

export async function withConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: (T | undefined)[] = new Array(tasks.length)
  let i = 0
  async function worker() {
    while (i < tasks.length) {
      const idx = i++
      results[idx] = await tasks[idx]()
    }
  }
  await Promise.all(Array.from({ length: limit }, worker))
  return results as T[]
}
