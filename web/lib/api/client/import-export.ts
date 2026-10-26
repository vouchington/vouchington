'use client'

import type { PageInfo } from '@/types/api-responses'
import type { RssFeedImportSummary, RssFeedImportSubmission } from '@/types/rss-feed-imports'
import { clientApi } from './instance'
import { admissionIdempotency } from './admission-idempotency'
import { clientFetch } from './raw-fetch'
import { ApiError, parseErrorResponseBody } from '@vouchington/api-client'

/** The server bounds the request body (`import_max_body_bytes`), so the client sends it as is. */
export type RssFeedImportBody = {
  urls?: string[]
  opml?: string
  csv?: string
  should_follow_imported_feeds?: boolean
}

export type RssFeedContentType = 'article' | 'podcast' | 'video' | 'mixed'

export type RssFeedImportErrorCode =
  | 'INVALID_URL'
  | 'INVALID_FEED_CONTENT'
  | 'FEED_FETCH_TIMEOUT'
  | 'CONTRIBUTION_LIMIT_EXCEEDED'
  | 'ACCOUNT_SUSPENDED'
  | 'IMPORT_FAILED'

export interface ImportResult {
  id?: string
  input: string
  status:
    | 'pending'
    | 'followed'
    | 'imported'
    | 'source_created'
    | 'recommendation_created'
    | 'already_following'
    | 'error'
  error_code?: RssFeedImportErrorCode
  entity_id?: string
  topic_slug?: string
  recommendation_post_id?: string
}

export type { RssFeedImportSubmission } from '@/types/rss-feed-imports'

export interface RssFeedImportStatus {
  import: RssFeedImportSummary
  /** One page of rows; pass `page_info.end_cursor` as `after` for the next. */
  rows: ImportResult[]
  page_info: PageInfo
}

export interface ExportTopic {
  name: string
  slug: string
  topic_type: string
}

export interface TopicImportResult {
  input: string
  status: 'followed' | 'recommendation_created' | 'already_following' | 'error'
  error?: string
  entity_id?: string
  recommendation_post_id?: string
}

export async function importRssFeeds(body: RssFeedImportBody): Promise<RssFeedImportSubmission> {
  return clientApi.post<RssFeedImportSubmission>('/api/v1/my/import/rss-feeds', body)
}

export function getRssFeedImport(
  importId: string,
  options: { after?: string } = {},
): Promise<RssFeedImportStatus> {
  const query = options.after ? `?after=${encodeURIComponent(options.after)}` : ''
  return clientApi.get<RssFeedImportStatus>(`/api/v1/my/import/rss-feeds/${importId}${query}`)
}

export function importTopics(body: { names: string[] }): Promise<{ results: TopicImportResult[] }> {
  return admissionIdempotency.run({ route: 'my.import.topics', body }, idempotencyKey =>
    clientApi.post<{ results: TopicImportResult[] }>('/api/v1/my/import/topics', body, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  )
}

export function exportTopics(): string {
  return '/api/v1/my/export/topics?download=1'
}

export function exportRssFeeds(
  feedType?: RssFeedContentType,
  format: 'opml' | 'csv' = 'opml',
): string {
  const params = new URLSearchParams()
  if (feedType) params.set('feed_type', feedType)
  if (format === 'csv') params.set('format', 'csv')
  const qs = params.size > 0 ? `?${params.toString()}` : ''
  return `/api/v1/my/export/rss-feeds${qs}`
}

export async function preflightExport(url: string): Promise<void> {
  const separator = url.includes('?') ? '&' : '?'
  const response = await clientFetch(`${url}${separator}preflight=1`, {
    credentials: 'include',
  })
  if (response.ok) {
    await response.body?.cancel()
    return
  }
  throw new ApiError('Export failed', response.status, await parseErrorResponseBody(response))
}
