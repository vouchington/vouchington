import onError from '@modules/on-error'
import { UnrecoverableError, unrecoverable } from '@vouchington/queue-errors'
import undici from 'undici'
import { getExternalRequestDispatcher } from '@modules/utils/http'
import {
  getSourceCacheHeaders,
  updateSourceCacheHeaders,
  getBlacklistSourceById,
  type DomainBlacklistSourceId,
  type SourceCacheHeaders,
} from '@services/urls-domains-blacklist/sources'
import {
  parseSourceId,
  createFetchError,
  getCacheHeadersFromResponse,
  createSourceNotFoundError,
  createSyncFailedError,
} from './sync-utils.mts'
import { syncDomainsWithDatabase } from './sync-db.mts'
import type { SyncBlacklistSourceResult } from './sync-types.mts'
import { ReplicaBehindError } from './replica-freshness.mts'
export type { SyncBlacklistSourceResult } from './sync-types.mts'

type UndiciResponse = Awaited<ReturnType<typeof undici.fetch>>

const FETCH_TIMEOUT_MS = 30_000
const UNCONDITIONAL_NOT_MODIFIED = 'Blocklist source returned 304 to an unconditional request'

type SyncBlacklistDependencies = {
  getBlacklistSourceById: typeof getBlacklistSourceById
  getSourceCacheHeaders: typeof getSourceCacheHeaders
  updateSourceCacheHeaders: typeof updateSourceCacheHeaders
  fetchBlacklist: typeof fetchBlacklist
  syncDomainsWithDatabase: typeof syncDomainsWithDatabase
}

const defaultDependencies: SyncBlacklistDependencies = {
  getBlacklistSourceById,
  getSourceCacheHeaders,
  updateSourceCacheHeaders,
  fetchBlacklist,
  syncDomainsWithDatabase,
}

export async function syncBlacklistSourceById(
  sourceId: DomainBlacklistSourceId,
  dependencies: Partial<SyncBlacklistDependencies> = {},
): Promise<void> {
  const syncDependencies = { ...defaultDependencies, ...dependencies }
  const source = await syncDependencies.getBlacklistSourceById(sourceId)
  if (!source) {
    onError(createSourceNotFoundError(sourceId))
    return
  }

  try {
    await syncBlacklistSource(sourceId, source.url, source.type, syncDependencies)
  } catch (err) {
    if (err instanceof ReplicaBehindError || err instanceof UnrecoverableError) throw err
    onError(err instanceof Error ? err : createSyncFailedError(source.url, err))
  }
}

export async function syncBlacklistSource(
  sourceId: DomainBlacklistSourceId,
  url: string,
  sourceType: 'url' | 'email' = 'url',
  dependencies: Partial<SyncBlacklistDependencies> = {},
): Promise<SyncBlacklistSourceResult> {
  const syncDependencies = { ...defaultDependencies, ...dependencies }
  const id = parseSourceId(sourceId)
  const cache = await syncDependencies.getSourceCacheHeaders(sourceId)
  const conditional = hasConditionalValidators(cache)
  const response = await syncDependencies.fetchBlacklist(url, conditional ? cache : null)

  if (response.status === 304) {
    if (!conditional) return unrecoverable(new Error(UNCONDITIONAL_NOT_MODIFIED))
    await syncDependencies.updateSourceCacheHeaders(sourceId, {
      etag: cache?.etag ?? null,
      lastModifiedAt: cache?.last_modified_at ?? null,
    })
    return { skipped: true, domainsAdded: 0, domainsRemoved: 0 }
  }

  if (!response.ok) {
    throw createFetchError(response.status, response.statusText)
  }

  return syncDependencies.syncDomainsWithDatabase(
    id,
    response,
    sourceType,
    getCacheHeadersFromResponse(response),
  )
}

function hasConditionalValidators(cache: SourceCacheHeaders | null): boolean {
  if (cache?.membership_diff_applied_at == null) return false
  return cache.etag != null || cache.last_modified_at != null
}

/* no-mistakes: integration=http */
async function fetchBlacklist(url: string, cache: SourceCacheHeaders | null): Promise<UndiciResponse> {
  return undici.fetch(url, {
    dispatcher: getExternalRequestDispatcher(),
    headers: createBlacklistFetchHeaders(cache),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  })
}

export function createBlacklistFetchHeaders(
  cache: SourceCacheHeaders | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept-Encoding': 'gzip, deflate, br',
  }
  if (cache?.membership_diff_applied_at == null) return headers
  if (cache.etag) headers['If-None-Match'] = cache.etag
  if (cache.last_modified_at) {
    headers['If-Modified-Since'] = new Date(cache.last_modified_at).toUTCString()
  }
  return headers
}
