import { community, pageInfo, timestamp, user } from './web-community-data.mts'
import type { ApiFixtureCase } from './types.mts'

export const webCommunityMemberModerationApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.communities.applications.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/applications`,
    query: { limit: '25' },
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/applications',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: { results: [], page_info: pageInfo, community_applications: {} },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/applications.mts'],
  },
  {
    id: 'web.communities.invites.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/invites`,
    query: { limit: '25' },
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/invites',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [{ __entity_type: 'community_invite', id: 'invite-1' }],
      page_info: pageInfo,
      community_invites: {
        'invite-1': {
          __entity_type: 'community_invite',
          id: 'invite-1',
          community_id: community.id,
          invited_user_id: null,
          invited_email: 'invitee@example.test',
          invited_by_id: user.id,
          accepted_at: null,
          accepted_by_id: null,
          declined_at: null,
          revoked_at: null,
          created_at: timestamp,
        },
      },
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/invites.mts'],
  },
  {
    id: 'web.communities.bans.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/bans`,
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/bans',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: { results: [], page_info: pageInfo, community_bans: {}, users: {} },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/bans.mts'],
  },
  {
    id: 'web.communities.restrictions.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/restrictions`,
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/restrictions',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [],
      page_info: pageInfo,
      community_restrictions: {},
      raid_mode_suggestion: {
        velocity_spike: false,
        flag_count: 0,
        latest_flagged_at: null,
      },
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/restrictions.mts'],
  },
]
