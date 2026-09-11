'use client'

import { clientApi } from './instance'
import { admissionIdempotency } from './admission-idempotency'
import { clientFetch } from './raw-fetch'
import { ApiError } from '../error'
import { parseErrorResponseBody } from '../error-helpers'
import { validateRssFeedImportBody, type RssFeedImportBody } from './rss-feed-import-validation'

export type RssFeedContentType = 'article' | 'podcast' | 'video' | 'mixed'

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
  error?: string
  entity_id?: string
  recommendation_post_id?: string
}

export interface RssFeedImportSummary {
  id: string
  total_rows: number
  completed_rows: number
  failed_rows: number
  pending_rows: number
  completed_at: string | null
  created_at: string
}

export interface RssFeedImportStatus {
  import: RssFeedImportSummary
  rows: ImportResult[]
}

export interface RssFeedImportSubmission {
  import: RssFeedImportSummary
  status_url: string
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
  validateRssFeedImportBody(body)
  return clientApi.post<RssFeedImportSubmission>('/api/v1/my/import/rss-feeds', body)
}

export function getRssFeedImport(importId: string): Promise<RssFeedImportStatus> {
  return clientApi.get<RssFeedImportStatus>(`/api/v1/my/import/rss-feeds/${importId}`)
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
