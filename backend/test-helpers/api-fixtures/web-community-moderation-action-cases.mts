import { community, communityPost, timestamp, user } from './web-community-data.mts'
import type { ApiFixtureCase } from './types.mts'

export const webCommunityModerationActionApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.communities.moderation-results.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/posts/${communityPost.id}/moderation-results`,
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/posts/:postId/moderation-results',
      pathParams: { communitySlug: community.slug, postId: communityPost.id },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      community_agent_moderations: [],
      platform_moderation: { status: 'in_review' },
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/moderation-results.mts'],
  },
  {
    id: 'web.communities.warning.create.default',
    method: 'POST',
    path: `/api/v1/communities/${community.slug}/warnings`,
    requestBody: {
      userId: user.id,
      reason: 'Spam in community',
      publicMessage: 'Please read the community rules.',
      resolveReport: false,
    },
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/warnings',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 201,
    body: {
      warning: {
        id: 'warning-1',
        issued_by_id: user.id,
        community_id: community.id,
        reason: 'Spam in community',
        public_message: 'Please read the community rules.',
        report_id: null,
        revoked_at: null,
        revoked_by_id: null,
        created_at: timestamp,
      },
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/warnings.mts'],
  },
  {
    id: 'web.communities.post-type-settings.update.default',
    method: 'PATCH',
    path: `/api/v1/communities/${community.slug}/post-type-settings`,
    requestBody: { allow_review_posts: true, allow_data_point_posts: true },
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/post-type-settings',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      community: {
        ...community,
        allow_review_posts: true,
        allow_data_point_posts: true,
      },
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/post-type-settings.mts'],
  },
]
