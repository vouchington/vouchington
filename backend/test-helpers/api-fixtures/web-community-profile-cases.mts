import {
  archivedCommunity,
  community,
  communityAiAgent,
  communityMetrics,
  communitySearchBody,
} from './web-community-data.mts'
import { communityOwner } from './web-community-member-data.mts'
import type { ApiFixtureCase } from './types.mts'

export const webCommunityProfileApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.communities.search.default',
    method: 'GET',
    path: '/api/v1/communities',
    query: { q: 'test' },
    route: { routeTemplate: '/api/v1/communities' },
    auth: 'fixture-user',
    status: 200,
    body: communitySearchBody,
    consumers: ['web', 'dotnet-core'],
    migratedFrom: ['web/test-helpers/api-responses/communities.ts'],
  },
  {
    id: 'web.communities.show.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}`,
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      community: {
        ...community,
        profile_image_id: 'community-profile-image-1',
        profile_image_placement: {
          placement_id: 'placement-community-profile-image-1',
          placement_revision: 2,
          image_id: 'community-profile-image-1',
        },
        banner_image_id: 'community-banner-image-1',
        banner_image_placement: {
          placement_id: 'placement-community-banner-image-1',
          placement_revision: 5,
          image_id: 'community-banner-image-1',
        },
      },
      user: communityOwner,
      membership: null,
      community_metrics: communityMetrics,
    },
    consumers: ['web', 'dotnet-core'],
    migratedFrom: ['web/test-helpers/api-responses/communities.ts'],
  },
  {
    id: 'web.communities.ai-agent.default',
    method: 'PUT',
    path: `/api/v1/communities/${community.slug}/ai-agents/self-promotion`,
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/ai-agents/:agentSlug',
      pathParams: { communitySlug: community.slug, agentSlug: 'self-promotion' },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      community_ai_agent: communityAiAgent,
    },
    consumers: ['web', 'dotnet-core'],
    migratedFrom: ['web/test-helpers/api-responses/communities.ts'],
  },
  {
    id: 'web.communities.archive.default',
    method: 'PATCH',
    path: `/api/v1/communities/${community.slug}`,
    requestBody: { archive: true },
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: { community: archivedCommunity },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/community.mts'],
  },
]
