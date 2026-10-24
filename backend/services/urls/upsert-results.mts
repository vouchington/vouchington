import { registerPostCommitAction, type QueryOptions } from '@data-stores/psql'
import type { ViewUrl } from './types.mts'
import { getOrCreateCrawlersForHostnames } from '@services/crawlers'
import { enqueueBulkOnUrlCreatedBestEffort } from '@queues/entity-listeners/enqueues'
import type { upsertUrlRows } from './upsert-write.mts'
type TransactionQueryWithClient = NonNullable<QueryOptions['query']> & { client: object }

export function extractInsertedUrlIds(
  rows: Array<{ hostname_id: string; id: string; inserted: boolean }>,
): string[] {
  return rows
    .filter(row => row.inserted)
    .toSorted(
      (left, right) =>
        left.hostname_id.localeCompare(right.hostname_id) || left.id.localeCompare(right.id),
    )
    .map(row => row.id)
}

export async function dispatchUrlCreatedEvents(
  insertedIds: string[],
  viewUrlsById: Map<string, ViewUrl>,
  queryOptions: QueryOptions,
  skipCreatedEvents: boolean,
  ownsTransaction: boolean,
): Promise<void> {
  if (insertedIds.length === 0) return
  if (skipCreatedEvents) return

  if (ownsTransaction && queryOptions.query) {
    registerPostCommitAction(queryOptions.query, async () => {
      await enqueueBulkOnUrlCreatedBestEffort(insertedIds)
    })
    return
  }
  if (queryOptions.client || hasTransactionQuery(queryOptions.query)) {
    await processUrlCreatedInline(insertedIds, viewUrlsById, queryOptions)
    return
  }

  await enqueueBulkOnUrlCreatedBestEffort(insertedIds)
}

async function processUrlCreatedInline(
  ids: string[],
  viewUrlsById: Map<string, ViewUrl>,
  options: QueryOptions,
): Promise<void> {
  const hostnameIds = new Set<string>()
  for (const id of ids) {
    const url = viewUrlsById.get(id)
    if (!url) continue
    if (url.hostname.is_blocked || !url.hostname.is_crawlable) continue
    hostnameIds.add(url.hostname.id)
  }
  await getOrCreateCrawlersForHostnames(null, [...hostnameIds], options)
}

export function toViewUrl(
  row: Awaited<ReturnType<typeof upsertUrlRows>>[number],
): ViewUrl & { canonical_hostname_id: string | null } {
  return {
    __entity_type: row.__entity_type,
    id: row.id,
    hostname: row.hostname,
    canonical_url_id: row.canonical_url_id,
    url: row.url,
    pathname: row.pathname,
    search_params: row.search_params,
    canonical_hostname_id: row.canonical_hostname_id,
  }
}

function hasTransactionQuery(query: QueryOptions['query']): query is TransactionQueryWithClient {
  return typeof query === 'function' && 'client' in query
}
