import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type {
  CommunitiesSearchResponseBody,
  CommunityResponseBody,
  CommunityMembersResponseBody,
  CommunityPostsResponseBody,
  CommunityApplicationsResponseBody,
  CommunityApplicationQuestionsResponseBody,
  CommunityInvitesResponseBody,
  CommunityListTopicsResponseBody,
  CommunityListRssFeedsResponseBody,
  CommunityListPostsResponseBody,
  CommunityListDomainsResponseBody,
  CommunityListUrlsResponseBody,
  CommunityListItemCountsResponseBody,
  CommunityAiAgentsResponseBody,
  CommunityPinnedPostsResponseBody,
} from '@/types/api-responses'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getCommunity = cache(
  async (
    idOrSlug: string,
    options?: { headers?: Record<string, string> },
  ): Promise<CommunityResponseBody | null> => {
    return returnNullForMissingEntity(
      serverApi.get<CommunityResponseBody>(`/api/v1/communities/${idOrSlug}`, options),
    )
  },
)

export const getCommunities = cache(
  async (options: GetOptions = {}): Promise<CommunitiesSearchResponseBody> => {
    return serverApi.get<CommunitiesSearchResponseBody>('/api/v1/communities', options)
  },
)

export const getCommunityMembers = cache(
  async (idOrSlug: string, options: GetOptions = {}): Promise<CommunityMembersResponseBody> => {
    return serverApi.get<CommunityMembersResponseBody>(
      `/api/v1/communities/${idOrSlug}/members`,
      options,
    )
  },
)

export const getCommunityPosts = cache(
  async (idOrSlug: string, options: GetOptions = {}): Promise<CommunityPostsResponseBody> => {
    return serverApi.get<CommunityPostsResponseBody>(
      `/api/v1/communities/${idOrSlug}/posts`,
      options,
    )
  },
)

export const getCommunityNews = cache(
  async (idOrSlug: string, options: GetOptions = {}): Promise<RssFeedItemsFeedResponseBody> => {
    return serverApi.get<RssFeedItemsFeedResponseBody>(
      `/api/v1/communities/${idOrSlug}/news`,
      options,
    )
  },
)

export const getCommunityPendingPosts = cache(
  async (idOrSlug: string, options: GetOptions = {}): Promise<CommunityPostsResponseBody> => {
    return serverApi.get<CommunityPostsResponseBody>(
      `/api/v1/communities/${idOrSlug}/posts/pending`,
      options,
    )
  },
)

export const getCommunityAiAgents = cache(
  async (idOrSlug: string, options: GetOptions = {}): Promise<CommunityAiAgentsResponseBody> => {
    return serverApi.get<CommunityAiAgentsResponseBody>(
      `/api/v1/communities/${idOrSlug}/ai-agents`,
      options,
    )
  },
)

export const getCommunityApplications = cache(
  async (
    idOrSlug: string,
    options: GetOptions = {},
  ): Promise<CommunityApplicationsResponseBody> => {
    return serverApi.get<CommunityApplicationsResponseBody>(
      `/api/v1/communities/${idOrSlug}/applications`,
      options,
    )
  },
)

export const getCommunityApplicationQuestions = cache(
  async (
    idOrSlug: string,
    options?: { headers?: Record<string, string> },
  ): Promise<CommunityApplicationQuestionsResponseBody> => {
    return serverApi.get<CommunityApplicationQuestionsResponseBody>(
      `/api/v1/communities/${idOrSlug}/application-questions`,
      options,
    )
  },
)

export const getCommunityInvites = cache(
  async (idOrSlug: string, options: GetOptions = {}): Promise<CommunityInvitesResponseBody> => {
    return serverApi.get<CommunityInvitesResponseBody>(
      `/api/v1/communities/${idOrSlug}/invites`,
      options,
    )
  },
)

export const getCommunityListTopics = cache(
  async (idOrSlug: string, options: GetOptions = {}): Promise<CommunityListTopicsResponseBody> => {
    return serverApi.get<CommunityListTopicsResponseBody>(
      `/api/v1/communities/${idOrSlug}/list-items/topics`,
      options,
    )
  },
)

export const getCommunityListRssFeeds = cache(
  async (
    idOrSlug: string,
    options: GetOptions = {},
  ): Promise<CommunityListRssFeedsResponseBody> => {
    return serverApi.get<CommunityListRssFeedsResponseBody>(
      `/api/v1/communities/${idOrSlug}/list-items/rss-feeds`,
      options,
    )
  },
)

export const getCommunityListPosts = cache(
  async (idOrSlug: string, options: GetOptions = {}): Promise<CommunityListPostsResponseBody> => {
    return serverApi.get<CommunityListPostsResponseBody>(
      `/api/v1/communities/${idOrSlug}/list-items/posts`,
      options,
    )
  },
)

export const getCommunityListDomains = cache(
  async (idOrSlug: string, options: GetOptions = {}): Promise<CommunityListDomainsResponseBody> => {
    return serverApi.get<CommunityListDomainsResponseBody>(
      `/api/v1/communities/${idOrSlug}/list-items/domains`,
      options,
    )
  },
)

export const getCommunityListUrls = cache(
  async (idOrSlug: string, options: GetOptions = {}): Promise<CommunityListUrlsResponseBody> => {
    return serverApi.get<CommunityListUrlsResponseBody>(
      `/api/v1/communities/${idOrSlug}/list-items/urls`,
      options,
    )
  },
)

export const getCommunityListItemCounts = cache(
  async (idOrSlug: string): Promise<CommunityListItemCountsResponseBody> => {
    return serverApi.get<CommunityListItemCountsResponseBody>(
      `/api/v1/communities/${idOrSlug}/list-items/counts`,
    )
  },
)

export const getCommunityPinnedPosts = cache(
  async (idOrSlug: string, options: GetOptions = {}): Promise<CommunityPinnedPostsResponseBody> => {
    return serverApi.get<CommunityPinnedPostsResponseBody>(
      `/api/v1/communities/${idOrSlug}/pinned-posts`,
      options,
    )
  },
)
