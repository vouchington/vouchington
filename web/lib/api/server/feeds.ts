import { cache } from 'react'
import { serverApi } from './instance'
import type { PostsResponseBody, ReferralLinkFeedResponse } from '@/types/api-responses'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getPostFeed = cache(
  async (feedType: string, options: GetOptions = {}): Promise<PostsResponseBody> => {
    return serverApi.get<PostsResponseBody>(`/api/v1/feeds/posts/${feedType}`, options)
  },
)

export const getRssFeedItemsFeed = cache(
  async (feedType: string, options: GetOptions = {}): Promise<RssFeedItemsFeedResponseBody> => {
    return serverApi.get<RssFeedItemsFeedResponseBody>(
      `/api/v1/feeds/rss_feed_items/${feedType}`,
      options,
    )
  },
)

export const getReferralLinksFeed = cache(
  async (feedType: string, options: GetOptions = {}): Promise<ReferralLinkFeedResponse> => {
    return serverApi.get<ReferralLinkFeedResponse>(
      `/api/v1/feeds/referral_links/${feedType}`,
      options,
    )
  },
)
