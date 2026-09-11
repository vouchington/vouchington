import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type {
  RssFeedsListResponseBody,
  TrendingFeedsResponse,
  ListResponse,
} from '@/types/api-responses'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getRssFeeds = cache(
  async (options: GetOptions = {}): Promise<RssFeedsListResponseBody> => {
    return serverApi.get<RssFeedsListResponseBody>('/api/v1/rss-feeds', options)
  },
)

export const getTrendingRssFeeds = cache(
  async (options: GetOptions = {}): Promise<TrendingFeedsResponse> => {
    return serverApi.get<TrendingFeedsResponse>('/api/v1/rss-feeds/trending', options)
  },
)

export const getTopicRssFeeds = cache(
  async <T = unknown>(
    topicId: string,
    options: { enabled?: boolean | null; discoverable?: boolean | null } = {},
  ): Promise<ListResponse<T>> => {
    const enabled = options.enabled === null ? 'null' : options.enabled
    const discoverable = options.discoverable === null ? 'null' : options.discoverable
    return serverApi.get<ListResponse<T>>('/api/v1/rss-feeds', {
      searchParams: { topic: topicId, enabled, discoverable },
    })
  },
)

export const getServerRssFeedCrawls = cache(
  async <T = unknown>(rssFeedId: string, options: GetOptions = {}): Promise<ListResponse<T>> => {
    return serverApi.get<ListResponse<T>>(
      `/api/v1/rss-feeds/${encodeURIComponent(rssFeedId)}/crawls`,
      options,
    )
  },
)

export const getServerRssFeedCrawl = cache(
  async <T = unknown>(rssFeedId: string, crawlId: string): Promise<T | null> => {
    return returnNullForMissingEntity(
      serverApi.get<T>(
        `/api/v1/rss-feeds/${encodeURIComponent(rssFeedId)}/crawls/${encodeURIComponent(crawlId)}`,
      ),
    )
  },
)
