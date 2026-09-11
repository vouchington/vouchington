import { calculateAverageRating } from '@ts-shared/utils'
import { communityHref, topicHref } from '@/lib/links/entity-href'
import { getTopicDisplayName } from '@/lib/topics/display-name'
import type {
  CommunitiesSearchResponseBody,
  PlatformStatsResponse,
  TopicsResponseBody,
  TrendingFeedsResponse,
  TrendingTopicsResponse,
} from '@/types/api-responses'
import { getTopicTypeLabel } from '@/types/topics'

export interface TrendingFeedPreviewItem {
  id: string
  title: string
  displayName: string
  href: string
}

export type TrendingFeedsViewModel = TrendingFeedPreviewItem[]

export interface TrendingTopicPreviewItem {
  id: string
  name: string
  href: string
  typeLabel: ReturnType<typeof getTopicTypeLabel>
  allowReviews: boolean
  averageRating: number | null
  followerCount: number
}

export type TrendingTopicsViewModel = TrendingTopicPreviewItem[]

export interface CommunityPreviewItem {
  id: string
  name: string
  href: string
  memberCount: number | null
}

export type TopCommunitiesViewModel = CommunityPreviewItem[]

export interface ReferralProgramPreviewItem {
  id: string
  name: string
  href: string
}

export type TopReferralProgramsViewModel = ReferralProgramPreviewItem[]

export type PlatformStatsViewModel = Pick<
  PlatformStatsResponse,
  'data_point_count' | 'topic_count' | 'review_count' | 'hostname_count'
>

export function projectTrendingFeeds(
  data: TrendingFeedsResponse | null,
): TrendingFeedsViewModel | null {
  if (data === null) return null
  return data.results.flatMap(result => {
    const feed = data.rss_feeds[result.id]
    if (!feed) return []
    return [
      {
        id: result.id,
        title: feed.title,
        displayName: getTopicDisplayName(feed.topic, { feedType: feed.feed_type }),
        href: topicHref(feed.topic),
      },
    ]
  })
}

export function projectTrendingTopics(
  data: TrendingTopicsResponse | null,
): TrendingTopicsViewModel | null {
  if (data === null) return null
  return data.results.flatMap(result => {
    const topic = data.topics[result.id]
    if (!topic) return []
    const metrics = data.topics_metrics[result.id]
    return [
      {
        id: result.id,
        name: topic.name,
        href: topicHref(topic),
        typeLabel: getTopicTypeLabel(topic.topic_type),
        allowReviews: topic.allow_reviews,
        averageRating: metrics?.ratings?.count
          ? calculateAverageRating(metrics.ratings.count)
          : null,
        followerCount: metrics?.bookmarks?.follow ?? 0,
      },
    ]
  })
}

export function projectTopCommunities(
  data: CommunitiesSearchResponseBody | null,
): TopCommunitiesViewModel | null {
  if (data === null) return null
  return data.results.slice(0, 5).flatMap(result => {
    const community = data.communities[result.id]
    if (!community) return []
    return [
      {
        id: result.id,
        name: community.name,
        href: communityHref(community),
        memberCount: data.community_metrics[result.id]?.member_count ?? null,
      },
    ]
  })
}

export function projectTopReferralPrograms(
  data: TopicsResponseBody | null,
): TopReferralProgramsViewModel | null {
  if (data === null) return null
  return data.results.slice(0, 5).flatMap(result => {
    const topic = data.topics[result.id]
    if (!topic) return []
    return [{ id: result.id, name: topic.name, href: topicHref(topic, 'referral-links') }]
  })
}

export function projectPlatformStats(
  data: PlatformStatsResponse | null,
): PlatformStatsViewModel | null {
  if (data === null) return null
  return {
    data_point_count: data.data_point_count,
    topic_count: data.topic_count,
    review_count: data.review_count,
    hostname_count: data.hostname_count,
  }
}
