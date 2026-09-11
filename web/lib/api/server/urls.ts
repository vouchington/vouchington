import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type {
  UrlDetailResponseBody,
  UrlListResponseBody,
  CrawlListResponseBody,
  CrawlDetailResponseBody,
} from '@/types/api-responses'
import {
  emptyUrlListResponse,
  isUrlSearchQueryBelowMinLength,
  normalizeUrlSearchQuery,
} from '../url-query-min-length'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getUrl = cache(
  (
    id: string,
    options?: { headers?: Record<string, string> },
  ): Promise<UrlDetailResponseBody | null> => {
    return returnNullForMissingEntity(
      serverApi.get<UrlDetailResponseBody>(`/api/v1/urls/${encodeURIComponent(id)}`, options),
    )
  },
)

export const getUrls = cache((options: GetOptions = {}): Promise<UrlListResponseBody> => {
  const query = options.searchParams?.query
  if (isUrlSearchQueryBelowMinLength(query)) {
    return Promise.resolve(emptyUrlListResponse())
  }
  if (typeof query !== 'string') {
    return serverApi.get<UrlListResponseBody>('/api/v1/urls', options)
  }
  const normalizedQuery = normalizeUrlSearchQuery(query)
  if (normalizedQuery === query) {
    return serverApi.get<UrlListResponseBody>('/api/v1/urls', options)
  }
  return serverApi.get<UrlListResponseBody>('/api/v1/urls', {
    ...options,
    searchParams: {
      ...options.searchParams,
      query: normalizedQuery,
    },
  })
})

export const getUrlCrawls = cache(
  (id: string, options: GetOptions = {}): Promise<CrawlListResponseBody> => {
    return serverApi.get<CrawlListResponseBody>(
      `/api/v1/urls/${encodeURIComponent(id)}/crawls`,
      options,
    )
  },
)

export const getUrlCrawl = cache(
  (
    id: string,
    crawlId: string,
    options?: { headers?: Record<string, string> },
  ): Promise<CrawlDetailResponseBody | null> => {
    return returnNullForMissingEntity(
      serverApi.get<CrawlDetailResponseBody>(
        `/api/v1/urls/${encodeURIComponent(id)}/crawls/${encodeURIComponent(crawlId)}`,
        options,
      ),
    )
  },
)
