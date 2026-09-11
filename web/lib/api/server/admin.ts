import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import { getUrl } from './urls'
import type { AdminReviewQueueResponse } from '@/types/admin-review-queue'

export const getCrawlers = cache(
  async <T = unknown>(options?: {
    limit?: number
    after?: string
    headers?: Record<string, string>
  }): Promise<{
    results: T[]
    page_info: { has_next_page: boolean; end_cursor: string | null }
  }> => {
    return serverApi.get('/api/v1/crawlers', {
      headers: options?.headers,
      searchParams: { limit: options?.limit, after: options?.after },
    })
  },
)

export const getCrawler = cache(
  async <T>(id: string, options?: { headers?: Record<string, string> }): Promise<T | null> => {
    return returnNullForMissingEntity(serverApi.get<T>(`/api/v1/crawlers/${id}`, options))
  },
)

interface UrlDetail {
  id: string
  url: string
}

export async function getUrlsByIds(ids: string[]): Promise<UrlDetail[]> {
  if (ids.length === 0) return []
  const results = await Promise.all(
    ids.map(id => getUrl(id).then(data => (data ? { id: data.url.id, url: data.url.url } : null))),
  )
  return results.filter((r): r is UrlDetail => r !== null)
}

export const getAdminReviewQueue = cache(
  async (options?: {
    after?: string | null
    headers?: Record<string, string>
    limit?: number
  }): Promise<AdminReviewQueueResponse> => {
    return serverApi.get<AdminReviewQueueResponse>('/api/v1/posts/review-queue', {
      headers: options?.headers,
      searchParams: {
        after: options?.after ?? undefined,
        limit: options?.limit,
      },
    })
  },
)
