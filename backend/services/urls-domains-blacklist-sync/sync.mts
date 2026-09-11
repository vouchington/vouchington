import onError from '@modules/on-error'
import undici from 'undici'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'
import {
  getSourceCacheHeaders,
  updateSourceCacheHeaders,
  getBlacklistSourceById,
  type DomainBlacklistSourceId,
} from '@services/urls-domains-blacklist/sources'
import {
  parseSourceId,
  createFetchError,
  getCacheHeadersFromResponse,
  createSourceNotFoundError,
  createSyncFailedError,
} from './sync-utils.mts'
import { syncDomainsWithDatabase } from './sync-db.mts'

const FETCH_TIMEOUT_MS = 30_000

export type SyncBlacklistSourceResult = {
  skipped: boolean
  domainsAdded: number
  domainsRemoved: number
}

type SourceCacheHeaders = {
  etag: string | null
  last_modified_at: Date | null
}

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
  } catch (error) {
    onError(error instanceof Error ? error : createSyncFailedError(source.url, error))
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
  const response = await syncDependencies.fetchBlacklist(url, cache)

  if (response.status === 304) {
    await syncDependencies.updateSourceCacheHeaders(sourceId, {
      etag: cache?.etag ?? null,
      lastModifiedAt: cache?.last_modified_at ?? null,
    })
    return { skipped: true, domainsAdded: 0, domainsRemoved: 0 }
  }

  if (!response.ok) {
    throw createFetchError(response.status, response.statusText)
  }

  const result = await syncDependencies.syncDomainsWithDatabase(id, response, sourceType)
  await syncDependencies.updateSourceCacheHeaders(sourceId, getCacheHeadersFromResponse(response))
  return result
}

/* no-mistakes: integration=http */
async function fetchBlacklist(url: string, cache: SourceCacheHeaders | null): Promise<Response> {
  return await undici.fetch(url, {
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
  if (cache?.etag) headers['If-None-Match'] = cache.etag
  if (cache?.last_modified_at) {
    headers['If-Modified-Since'] = new Date(cache.last_modified_at).toUTCString()
  }
  return headers
}
