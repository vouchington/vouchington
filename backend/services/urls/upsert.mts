import { upsertUrlHostnames } from '@services/urls-hostnames'
import { upsertUrlContentTypes } from './content-types.mts'
import type { QueryOptions } from '@data-stores/psql/types'
import type { ViewUrl } from './types.mts'
import { getUrlsByIds, getUrlById } from './get.mts'
import { getOrCreateCrawlerForHostname } from '@services/crawlers'
import createError from 'http-errors'
import { isPublicHostname, normalizeUrlForUrlTable } from '@modules/utils/urls'
import { enqueueBulkOnUrlCreated } from '@queues/entity-listeners/enqueues'
import { invalidate } from '@services/entity-cache'
import { assertUrlAllowedByWebRisk } from '@services/web-risk/check'
import { upsertUrlRows } from './upsert-write.mts'

type AddUrlOptions = {
  content_type?: string
  skipCreatedEvents?: boolean
  preserveHttp?: boolean
} & QueryOptions
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

export const addUrls = async (
  userId: string | null,
  hrefs: string[],
  options: AddUrlOptions = {},
): Promise<ViewUrl[]> => {
  const { content_type, skipCreatedEvents = false, preserveHttp = false, ...queryOptions } = options
  // Public-host checks are best-effort in batch mode — skip non-public items only.
  // Only reject actual IP literals, not domain names with a private-looking prefix.
  const urls = hrefs.flatMap(href => {
    const url = normalizeUrlForUrlTable(href, { preserveHttp })
    return isPublicHostname(url.hostname) ? [url] : []
  })
  if (urls.length === 0) return []

  // Deduplicate by url.toString() (the conflict key), keeping the first occurrence,
  // matching the same guard in upsertUrlHostnames. Without this, two entries with the
  // same normalized URL in a single INSERT ... ON CONFLICT DO UPDATE causes Postgres
  // error 21000 ("command cannot affect row a second time").
  const seen = new Set<string>()
  const uniqueUrls = urls.filter(url => {
    const key = url.toString()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  await Promise.all(uniqueUrls.map(url => assertUrlAllowedByWebRisk(url.toString())))

  const hostnames = await upsertUrlHostnames(
    userId,
    uniqueUrls.map(url => url.hostname),
    queryOptions,
  )
  for (const url of uniqueUrls) {
    if (!hostnames.has(url.hostname)) throw new Error(`Hostname not found for ${url.hostname}`)
  }

  const values: unknown[] = [
    uniqueUrls.map(url => url.toString()),
    uniqueUrls.map(url => hostnames.get(url.hostname)!),
    uniqueUrls.map(url => url.pathname),
    uniqueUrls.map(url => Object.fromEntries(url.searchParams)),
    uniqueUrls.map(() => userId || null),
  ]

  let mimeTypeId: string | null = null
  if (content_type) {
    mimeTypeId = await upsertUrlContentTypes(content_type, queryOptions)
  }

  const rows = await upsertUrlRows(
    values,
    mimeTypeId === null ? null : uniqueUrls.map(() => mimeTypeId),
    queryOptions,
  )

  const idsByUrl = new Map(rows.map(row => [row.url as string, row.id as string]))
  const orderedIds = uniqueUrls.flatMap(url => idsByUrl.get(url.toString()) ?? [])
  const viewUrlsById = new Map((await getUrlsByIds(orderedIds, queryOptions)).map(u => [u.id, u]))
  const viewUrls = orderedIds.flatMap(id => {
    const url = viewUrlsById.get(id)
    return url ? [url] : []
  })

  for (const viewUrl of viewUrls) {
    if (viewUrl.hostname.blocked) {
      throw createError(422, `Hostname ${viewUrl.hostname.hostname} is blocked`)
    }
  }

  const insertedIds = extractInsertedUrlIds(rows)
  await dispatchUrlCreatedEvents(insertedIds, queryOptions, skipCreatedEvents)

  // Skip invalidation inside transactions — the transaction hasn't committed yet, so
  // Valkey invalidation would race with commit. Callers that insert URLs inside a transaction
  // (by passing queryOptions.client) MUST call invalidate.urls(...urlStrings) post-commit
  // to clear the urls_lookup cache. The 1-day null-sentinel TTL means a missed invalidation
  // can cause a 404-until-expiry regression for URL lookups.
  const updatedIds = rows.flatMap(row => {
    const r = row as { inserted?: boolean; id?: string }
    return r.inserted === false && r.id ? [r.id] : []
  })
  if (!queryOptions.client && (insertedIds.length > 0 || updatedIds.length > 0)) {
    const changedIdSet = new Set([...insertedIds, ...updatedIds])
    const changedIds = [...changedIdSet]
    const changedUrlStrings = rows.flatMap(row => (changedIdSet.has(row.id) ? [row.url] : []))
    await invalidate.urls(...changedUrlStrings, ...changedIds)
  }

  return viewUrls
}

export const addUrl = (
  userId: string | null,
  url: string,
  options?: AddUrlOptions,
): Promise<ViewUrl | null> =>
  Promise.resolve().then(() => {
    const preserveHttp = options?.preserveHttp ?? false
    const normalizedUrl = normalizeUrlForUrlTable(url, { preserveHttp })
    if (!isPublicHostname(normalizedUrl.hostname)) return null
    return addUrls(userId, [normalizedUrl.toString()], options).then(x => x[0] || null)
  })

async function dispatchUrlCreatedEvents(
  insertedIds: string[],
  queryOptions: QueryOptions,
  skipCreatedEvents: boolean,
): Promise<void> {
  if (insertedIds.length === 0) return
  if (skipCreatedEvents) return

  if (queryOptions.client || hasTransactionQuery(queryOptions.query)) {
    await processUrlCreatedInline(insertedIds, queryOptions)
    return
  }

  void enqueueBulkOnUrlCreated(insertedIds)
}

async function processUrlCreatedInline(ids: string[], options: QueryOptions): Promise<void> {
  await ids.reduce(async (previous, id) => {
    await previous

    const url = await getUrlById(id, options)
    if (!url) return
    if (url.hostname.blocked || url.hostname.crawlable === false) return
    await getOrCreateCrawlerForHostname(null, url.hostname.id, options)
  }, Promise.resolve())
}

function hasTransactionQuery(query: QueryOptions['query']): query is TransactionQueryWithClient {
  return typeof query === 'function' && 'client' in query
}
