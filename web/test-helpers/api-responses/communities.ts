import type {
  CommunitiesSearchResponseBody,
  Community,
  CommunityAiAgent,
  CommunityAiAgentResponseBody,
  CommunityMetrics,
  CommunityResponseBody,
} from '@/types/api-responses'

import { loadWebApiFixture } from './fixture-loader'

export function makeCommunity(overrides: Partial<Community> = {}): Community {
  const fixture = loadWebApiFixture('web.communities.show.default')
  return {
    ...fixture.community,
    ...overrides,
  }
}

export function makeCommunityMetrics(overrides: Partial<CommunityMetrics> = {}): CommunityMetrics {
  const fixture = loadWebApiFixture('web.communities.show.default')
  if (fixture.community_metrics === null) {
    throw new Error('web.communities.show.default must include community_metrics')
  }

  return {
    ...fixture.community_metrics,
    ...overrides,
  }
}

export function makeCommunitiesSearchResponse({
  communities = [makeCommunity()],
  pageInfo = { has_next_page: false, start_cursor: null, end_cursor: null },
  users = {},
  communityMetrics,
  communityMemberships,
  pendingApplicationCommunityIds,
  bookmarks,
}: {
  communities?: Community[]
  pageInfo?: CommunitiesSearchResponseBody['page_info']
  users?: CommunitiesSearchResponseBody['users']
  communityMetrics?: CommunitiesSearchResponseBody['community_metrics']
  communityMemberships?: CommunitiesSearchResponseBody['community_memberships']
  pendingApplicationCommunityIds?: CommunitiesSearchResponseBody['pending_application_community_ids']
  bookmarks?: CommunitiesSearchResponseBody['bookmarks']
} = {}): CommunitiesSearchResponseBody {
  const communitiesById = Object.fromEntries(
    communities.map(community => [community.id, community]),
  ) as Record<string, Community>
  const metricsById =
    communityMetrics === undefined
      ? Object.fromEntries(
          communities.map(community => [community.id, makeCommunityMetrics({ id: community.id })]),
        )
      : communityMetrics

  return {
    results: communities.map(community => ({ __entity_type: 'community', id: community.id })),
    page_info: pageInfo,
    communities: communitiesById,
    users,
    community_metrics: metricsById,
    ...(communityMemberships === undefined ? {} : { community_memberships: communityMemberships }),
    ...(pendingApplicationCommunityIds === undefined
      ? {}
      : { pending_application_community_ids: pendingApplicationCommunityIds }),
    ...(bookmarks === undefined ? {} : { bookmarks }),
  }
}

export function makeCommunityResponse({
  community = makeCommunity(),
  user = null,
  communityMetrics,
  membership,
  hasPendingApplication,
}: {
  community?: Community
  user?: CommunityResponseBody['user']
  communityMetrics?: CommunityResponseBody['community_metrics']
  membership?: CommunityResponseBody['membership']
  hasPendingApplication?: CommunityResponseBody['has_pending_application']
} = {}): CommunityResponseBody {
  return {
    community,
    user,
    community_metrics:
      communityMetrics === undefined
        ? makeCommunityMetrics({ id: community.id })
        : communityMetrics,
    ...(membership === undefined ? {} : { membership }),
    ...(hasPendingApplication === undefined
      ? {}
      : { has_pending_application: hasPendingApplication }),
  }
}

export function makeCommunityAiAgent(overrides: Partial<CommunityAiAgent> = {}): CommunityAiAgent {
  const fixture = loadWebApiFixture('web.communities.ai-agent.default')
  return {
    ...fixture.community_ai_agent,
    ...overrides,
  }
}

export function makeCommunityAiAgentResponse({
  communityAiAgent = makeCommunityAiAgent(),
}: {
  communityAiAgent?: CommunityAiAgent
} = {}): CommunityAiAgentResponseBody {
  return { community_ai_agent: communityAiAgent }
}
