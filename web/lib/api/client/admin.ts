'use client'

import { clientApi } from './instance'
import type { AdminReviewQueueUpdateResponse } from '@/types/admin-review-queue'

interface EnqueueUrlCrawlResponseBody {
  success: boolean
  message: string
}

export function enqueueUrlCrawl(id: string, body?: unknown): Promise<EnqueueUrlCrawlResponseBody> {
  return clientApi.post<EnqueueUrlCrawlResponseBody>(`/api/v1/urls/${id}/crawl`, body)
}

export interface ArticleSyncItem {
  file: string
  slug: string
  action: 'created' | 'updated' | 'skipped' | 'error'
  error?: string
}

export interface ArticleSyncResult {
  results: ArticleSyncItem[]
  summary: { created: number; updated: number; skipped: number; errored: number }
}

interface ArticleSyncTriggerResponse {
  jobId: string
}

export type ArticleSyncJobStatus =
  | { status: 'active' }
  | { status: 'completed'; result: ArticleSyncResult }
  | { status: 'failed'; error: string }

export function triggerArticleSync(): Promise<ArticleSyncTriggerResponse> {
  return clientApi.post<ArticleSyncTriggerResponse>('/api/v1/article-syncs')
}

export function getArticleSyncStatus(jobId: string): Promise<ArticleSyncJobStatus> {
  return clientApi.get<ArticleSyncJobStatus>(`/api/v1/article-syncs/${jobId}`)
}

export async function updateAdminReviewQueuePost(
  postId: string,
  status: 'approved' | 'rejected',
): Promise<AdminReviewQueueUpdateResponse> {
  const response = await clientApi.post<{ clearance_status: string }>(
    `/api/v1/posts/${postId}/clearances`,
    {
      status,
    },
  )

  return {
    post: {
      id: postId,
      clearance_status: response.clearance_status as 'approved' | 'rejected',
      clearance_updated_at: new Date().toISOString(),
    },
  }
}

export function markPostForReview(idOrSlug: string): Promise<{ clearance_status: string }> {
  return clientApi.post<{ clearance_status: string }>(`/api/v1/posts/${idOrSlug}/clearances`, {
    status: 'in_review',
  })
}

export function updateCrawler(crawlerId: string, body: unknown): Promise<void> {
  return clientApi.patch(`/api/v1/crawlers/${crawlerId}`, body)
}
