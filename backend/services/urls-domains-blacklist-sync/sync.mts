import onError from '@modules/on-error'
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
import { readWriterWalLsn, ReplicaBehindError } from './replica-freshness.mts'
export type { SyncBlacklistSourceResult } from './sync-types.mts'
export { readWriterWalLsn, ReplicaBehindError } from './replica-freshness.mts'

const FETCH_TIMEOUT_MS = 30_000

/** Retryable. The list has not changed, and this source has no committed membership diff. */
export class BlocklistUnmodifiedWithoutSyncError extends Error {
  constructor() {
    super('Blocklist source returned 304 before a successful membership diff')
    this.name = 'BlocklistUnmodifiedWithoutSyncError'
  }
}

type SyncBlacklistDependencies = {
  getBlacklistSourceById: typeof getBlacklistSourceById
  getSourceCacheHeaders: typeof getSourceCacheHeaders
  updateSourceCacheHeaders: typeof updateSourceCacheHeaders
  fetchBlacklist: typeof fetchBlacklist
  syncDomainsWithDatabase: typeof syncDomainsWithDatabase
  /** Writer LSN captured at job start. Direct callers read one when this is omitted. */
  writerLsn?: string
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
    if (err instanceof ReplicaBehindError || err instanceof BlocklistUnmodifiedWithoutSyncError) {
      throw err
    }
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
  const successRecorded = cache?.membership_diff_applied_at != null
  let response = await syncDependencies.fetchBlacklist(url, successRecorded ? cache : null)
  // A 304 without a committed diff is not proof the membership matches. Read the list once more.
  if (response.status === 304 && !successRecorded) {
    response = await syncDependencies.fetchBlacklist(url, null)
  }

  if (response.status === 304) {
    if (!successRecorded) throw new BlocklistUnmodifiedWithoutSyncError()
    await syncDependencies.updateSourceCacheHeaders(sourceId, {
      etag: cache?.etag ?? null,
      lastModifiedAt: cache?.last_modified_at ?? null,
    })
    return { skipped: true, domainsAdded: 0, domainsRemoved: 0 }
  }

  if (!response.ok) {
    throw createFetchError(response.status, response.statusText)
  }

  const writerLsn = syncDependencies.writerLsn ?? (await readWriterWalLsn())
  const result = await syncDependencies.syncDomainsWithDatabase(
    id,
    response,
    sourceType,
    undefined,
    {
      writerLsn,
    },
  )
  await syncDependencies.updateSourceCacheHeaders(sourceId, getCacheHeadersFromResponse(response))
  return result
}

/* no-mistakes: integration=http */
async function fetchBlacklist(url: string, cache: SourceCacheHeaders | null): Promise<Response> {
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
