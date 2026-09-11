'use client'

import { clientApi } from './instance'
import { assertEncodablePathSegmentIdentifier } from './path-identifiers'
import {
  assertFollowerDistributionSendBody,
  type FollowerDistributionSendBody,
} from './follower-distributions'
import type {
  CreateSourceResponseBody,
  FollowerDistributionAcceptedResponseBody,
  ListResponse,
  RssFeedRefreshResponseBody,
  RssFeedResponseBody,
  RssFeedsListResponseBody,
} from '@/types/api-responses'
import type { RssFeedCrawlSummary, ViewRssFeed } from '@/types/rss-feeds'

export async function searchRssFeedsClient(
  q: string,
  signal?: AbortSignal,
): Promise<ViewRssFeed[]> {
  const params = new URLSearchParams({ q, limit: '10' })
  const data = await clientApi.get<RssFeedsListResponseBody>(
    `/api/v1/rss-feeds?${params.toString()}`,
    { signal },
  )
  return data.results
}

export function getRssFeedCrawls(rssFeedId: string): Promise<ListResponse<RssFeedCrawlSummary>> {
  const safeId = assertEncodablePathSegmentIdentifier(rssFeedId)
  return clientApi.get<ListResponse<RssFeedCrawlSummary>>(
    `/api/v1/rss-feeds/${encodeURIComponent(safeId)}/crawls`,
  )
}

export function createSource(body: {
  rss_feed_url: string
  follow?: boolean
}): Promise<CreateSourceResponseBody> {
  return clientApi.post<CreateSourceResponseBody>('/api/v1/rss-feeds', body)
}

export function updateRssFeed(rssFeedId: string, body: unknown): Promise<RssFeedResponseBody> {
  const safeId = assertEncodablePathSegmentIdentifier(rssFeedId)
  return clientApi.patch<RssFeedResponseBody>(
    `/api/v1/rss-feeds/${encodeURIComponent(safeId)}`,
    body,
  )
}

export function deleteRssFeed(rssFeedId: string): Promise<void> {
  const safeId = assertEncodablePathSegmentIdentifier(rssFeedId)
  return clientApi.delete(`/api/v1/rss-feeds/${encodeURIComponent(safeId)}`)
}

export function refreshRssFeed(
  rssFeedId: string,
  body: unknown,
): Promise<RssFeedRefreshResponseBody> {
  const safeRssFeedId = assertEncodablePathSegmentIdentifier(rssFeedId)
  return clientApi.post<RssFeedRefreshResponseBody>(
    `/api/v1/rss-feeds/${encodeURIComponent(safeRssFeedId)}/refreshes`,
    body,
  )
}

export function shareRssFeedItemWithFollowers(
  rssFeedItemId: string,
): Promise<FollowerDistributionAcceptedResponseBody> {
  const safeRssFeedItemId = assertEncodablePathSegmentIdentifier(rssFeedItemId)
  return clientApi.post<FollowerDistributionAcceptedResponseBody>(
    `/api/v1/rss-feed-items/${encodeURIComponent(safeRssFeedItemId)}/shares`,
  )
}

export function sendRssFeedItemToFollowers(
  rssFeedItemId: string,
  body: FollowerDistributionSendBody,
): Promise<FollowerDistributionAcceptedResponseBody> {
  const safeRssFeedItemId = assertEncodablePathSegmentIdentifier(rssFeedItemId)
  assertFollowerDistributionSendBody(body)
  return clientApi.post<FollowerDistributionAcceptedResponseBody>(
    `/api/v1/rss-feed-items/${encodeURIComponent(safeRssFeedItemId)}/sends`,
    body,
  )
}
