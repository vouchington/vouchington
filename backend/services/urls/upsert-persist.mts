import { dispatchUrlCreatedEvents, extractInsertedUrlIds, toViewUrl } from './upsert-results.mts'
import {
  beginTransaction,
  withTransactionOptions,
  registerPostCommitAction,
} from '@data-stores/psql'
import { lockHostnameOwnership } from '@services/urls-hostnames/ownership-lock'
import { upsertUrlHostnames } from '@services/urls-hostnames'
import {
  getHostnamePolicyGroups,
  getLocalHostnamePolicies,
} from '@services/urls-hostnames/policies'
import { upsertMediaTypes } from './media-types.mts'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import type { ViewUrl } from './types.mts'
import createError from 'http-errors'
import { invalidate } from '@services/entity-cache'
import { upsertUrlRows } from './upsert-write.mts'

export type AddUrlOptions = {
  content_type?: string
  skipCreatedEvents?: boolean
  preserveHttp?: boolean
} & QueryOptions
export type AssessedUrls = readonly URL[]

/** Persist an unlocked provider assessment, checking mutable local policy again after locks. */
export async function persistAssessedUrls(
  userId: string | null,
  uniqueUrls: AssessedUrls,
  options: AddUrlOptions = {},
): Promise<Array<ViewUrl & { canonical_hostname_id: string | null }>> {
  if (uniqueUrls.length === 0) return []
  if (options.query || options.client)
    return withTransactionOptions(options, query =>
      persistInTransaction(userId, uniqueUrls, { ...options, query }, false),
    )
  await using query = await beginTransaction()
  const result = await persistInTransaction(userId, uniqueUrls, { ...options, query }, true)
  await query.commit()
  return result
}

async function persistInTransaction(
  userId: string | null,
  uniqueUrls: AssessedUrls,
  options: AddUrlOptions & { query: TransactionQuery },
  ownsTransaction: boolean,
): Promise<Array<ViewUrl & { canonical_hostname_id: string | null }>> {
  const {
    content_type,
    skipCreatedEvents = false,
    preserveHttp: _preserveHttp,
    ...queryOptions
  } = options
  // ast-grep-ignore: no-three-sequential-awaits -- resolve ids before ownership locks, then reread local policy to observe the previous lock holder's commit.
  const resolved = await upsertUrlHostnames(
    userId,
    uniqueUrls.map(url => url.hostname),
    queryOptions,
    'private_email',
  )
  await lockHostnameOwnership(options.query, [...resolved.values()])
  const policies = await getLocalHostnamePolicies(
    getHostnamePolicyGroups(uniqueUrls.map(url => url.hostname)),
    queryOptions,
  )
  for (const url of uniqueUrls) {
    if (policies.get(url.hostname)?.is_blocked)
      throw createError(422, `Hostname ${url.hostname} is blocked`)
  }
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
    mimeTypeId = await upsertMediaTypes(content_type, queryOptions)
  }

  const rows = await upsertUrlRows(
    values,
    mimeTypeId === null ? null : uniqueUrls.map(() => mimeTypeId),
    queryOptions,
  )

  const idsByUrl = new Map(rows.map(row => [row.url, row]))
  const viewUrls = uniqueUrls.flatMap(url => {
    const row = idsByUrl.get(url.toString())
    return row ? [toViewUrl(row)] : []
  })
  const viewUrlsById = new Map(viewUrls.map(url => [url.id, url]))

  for (const viewUrl of viewUrls) {
    if (viewUrl.hostname.is_blocked) {
      throw createError(422, `Hostname ${viewUrl.hostname.hostname} is blocked`)
    }
  }

  const insertedIds = extractInsertedUrlIds(rows)
  await dispatchUrlCreatedEvents(
    insertedIds,
    viewUrlsById,
    queryOptions,
    skipCreatedEvents,
    ownsTransaction,
  )

  // Invalidation must see committed URL rows; otherwise a concurrent lookup can cache a miss.
  const updatedIds = rows.flatMap(row => {
    const r = row as { inserted?: boolean; id?: string }
    return r.inserted === false && r.id ? [r.id] : []
  })
  if (!queryOptions.client && (insertedIds.length > 0 || updatedIds.length > 0)) {
    const changedIdSet = new Set([...insertedIds, ...updatedIds])
    const changedIds = [...changedIdSet]
    const changedUrlStrings = rows.flatMap(row => (changedIdSet.has(row.id) ? [row.url] : []))
    registerPostCommitAction(options.query, async () => {
      await invalidate.urls(...changedUrlStrings, ...changedIds)
    })
  }

  return viewUrls
}
