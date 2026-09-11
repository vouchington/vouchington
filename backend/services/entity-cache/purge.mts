import createHttpError from 'http-errors'
import { fetch } from 'undici'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'
import { CACHE_PURGE_SECRET_HEADER, MAX_TAGS_PER_REQUEST } from '@ts-shared/cache'

function isCachePurgeSkipped(): boolean {
  return process.env.SKIP_CACHE_PURGE === 'true'
}

function getConfiguredWorkerRoute(route: string | undefined): string | undefined {
  const trimmedRoute = route?.trim()
  if (!trimmedRoute || trimmedRoute === 'undefined' || trimmedRoute === 'null') {
    return undefined
  }
  return trimmedRoute.replace(/\/$/, '')
}

// Sends entity Cache-Tags to the worker's POST /infra/cache-purge route so the platform cache
// evicts every response tagged with them (see @ts-shared/cache/cache-tags.mts). Most callers enqueue
// through @queues/cache-purge. Privacy-boundary callers may await it directly after first recording
// durable retry work. This throws so either the queue retry policy or the caller's durable-work
// policy owns failures rather than silently swallowing them.
/* no-mistakes: integration=http */
export async function purgeCacheTags(tags: readonly string[]): Promise<void> {
  if (tags.length === 0 || isCachePurgeSkipped()) return
  const route = getConfiguredWorkerRoute(process.env.CF_WORKER_ROUTE)
  // Without an explicit route, there is no deployed worker target to call. Skip quietly so
  // local and undeployed environments do not try to guess at a production origin.
  if (!route) return
  const secret = process.env.CF_WORKER_SECRET
  // No CF_WORKER_SECRET configured means there's no worker deployment to verify against
  // (e.g. local dev without the worker running) — nothing to do, and nothing to retry.
  if (!secret) return

  let response: Awaited<ReturnType<typeof fetch>>
  try {
    response = await fetch(`${route}/infra/cache-purge`, {
      method: 'POST',
      dispatcher: getExternalRequestDispatcher(),
      headers: { 'content-type': 'application/json', [CACHE_PURGE_SECRET_HEADER]: secret },
      body: JSON.stringify({ tags: tags.slice(0, MAX_TAGS_PER_REQUEST) }),
      signal: AbortSignal.timeout(5000),
    })
  } catch (error) {
    throw createHttpError(502, 'Cache purge request failed', { cause: error })
  }
  if (!response.ok) {
    throw createHttpError(response.status, 'Cache purge request failed', {
      cause: new Error(`Cache purge HTTP ${response.status}`),
    })
  }
}
