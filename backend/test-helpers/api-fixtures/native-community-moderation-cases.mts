import { community, timestamp, user } from './web-community-data.mts'
import type { ApiFixtureCase } from './types.mts'
import { encodeCursor } from '@modules/pagination'

const banId = '00000000-0000-7000-8000-000000000901'
const secondBanId = '00000000-0000-7000-8000-000000000903'
const thirdBanId = '00000000-0000-7000-8000-000000000905'
const banUserId = '00000000-0000-7000-8000-000000000904'
const banSummary = {
  id: banId,
  community_id: community.id,
  user_id: banUserId,
  banned_by_id: '00000000-0000-7000-8000-000000000902',
  expires_at: null,
  created_at: timestamp,
  updated_at: timestamp,
  lifted_at: null,
  lifted_by_id: null,
}
const nativeBanConsumers = ['swift-core', 'swift-ui', 'dotnet-core'] as const

export const nativeCommunityModerationApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.communities.bans.active.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/bans/users/${banUserId}`,
    query: { limit: '20' },
    route: {
      routeTemplate: '/api/v1/communities/:idOrSlug/bans/users/:userId',
      pathParams: { idOrSlug: community.slug, userId: banUserId },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [{ __entity_type: 'community_ban', id: banId }],
      page_info: {
        has_next_page: false,
        start_cursor: encodeCursor({
          timestamp: 'infinity',
          scope: `community-active-bans:${community.id}:${banUserId}`,
          id: banId,
        }),
        end_cursor: null,
      },
      community_bans: { [banId]: banSummary },
      users: {
        [banUserId]: { ...user, id: banUserId },
      },
    },
    consumers: [...nativeBanConsumers],
    migratedFrom: ['backend/api/v1/communities/ban-details.mts'],
  },
  {
    id: 'native.communities.bans.detail.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/bans/${banId}`,
    route: {
      routeTemplate: '/api/v1/communities/:idOrSlug/bans/:banId',
      pathParams: { idOrSlug: community.slug, banId },
    },
    auth: 'fixture-user',
    status: 200,
    body: { community_ban: { ...banSummary, reason: 'Repeated spam' } },
    consumers: [...nativeBanConsumers],
    migratedFrom: ['backend/api/v1/communities/ban-details.mts'],
  },
  {
    id: 'native.communities.bans.lift-one.default',
    method: 'DELETE',
    path: `/api/v1/communities/${community.slug}/bans/${banId}`,
    route: {
      routeTemplate: '/api/v1/communities/:idOrSlug/bans/:banId',
      pathParams: { idOrSlug: community.slug, banId },
    },
    auth: 'fixture-user',
    status: 200,
    body: { community_id: community.id, user_id: banUserId, lifted_ban_ids: [banId] },
    consumers: [...nativeBanConsumers],
    migratedFrom: ['backend/api/v1/communities/ban-details.mts'],
  },
  {
    id: 'native.communities.bans.lift-all.default',
    method: 'DELETE',
    path: `/api/v1/communities/${community.slug}/bans/users/${banUserId}`,
    route: {
      routeTemplate: '/api/v1/communities/:idOrSlug/bans/users/:userId',
      pathParams: { idOrSlug: community.slug, userId: banUserId },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      community_id: community.id,
      user_id: banUserId,
      lifted_ban_ids: [banId, secondBanId, thirdBanId],
    },
    consumers: [...nativeBanConsumers],
    migratedFrom: ['backend/api/v1/communities/ban-details.mts'],
  },
  ...(
    [
      {
        id: 'native.communities.bans.lift-all.forbidden',
        status: 403,
        body: {
          message: 'COMMUNITY_BAN_LIFT_ALL_FORBIDDEN',
          code: 'COMMUNITY_BAN_LIFT_ALL_FORBIDDEN',
        },
        contract: 'DELETE:/api/v1/communities/:idOrSlug/bans/users/:userId#forbidden',
      },
      {
        id: 'native.communities.bans.lift-all.overflow',
        status: 409,
        body: {
          message: 'COMMUNITY_BAN_LIFT_ALL_LIMIT_REACHED',
          code: 'COMMUNITY_BAN_LIFT_ALL_LIMIT_REACHED',
          cap: 1,
        },
        contract: 'DELETE:/api/v1/communities/:idOrSlug/bans/users/:userId#overflow',
      },
    ] as const
  ).map(({ id, status, body, contract }) => ({
    id,
    method: 'DELETE' as const,
    path: `/api/v1/communities/${community.slug}/bans/users/${banUserId}`,
    route: {
      routeTemplate: '/api/v1/communities/:idOrSlug/bans/users/:userId',
      pathParams: { idOrSlug: community.slug, userId: banUserId },
    },
    auth: 'fixture-user' as const,
    status,
    backendResponseContractKey: contract,
    body,
    consumers: [...nativeBanConsumers],
    migratedFrom: ['backend/api/v1/communities/ban-details.mts'],
  })),
  {
    id: 'native.communities.membership-cap.join.conflict',
    method: 'POST',
    path: `/api/v1/communities/${community.slug}/members`,
    route: {
      routeTemplate: '/api/v1/communities/:idOrSlug/members',
      pathParams: { idOrSlug: community.slug },
    },
    auth: 'fixture-user',
    status: 409,
    backendResponseContractKey: 'POST:/api/v1/communities/:idOrSlug/members#membership-cap',
    body: {
      message: 'Community membership limit reached',
      code: 'COMMUNITY_MEMBERSHIP_LIMIT_REACHED',
    },
    consumers: [...nativeBanConsumers],
    migratedFrom: ['backend/api/v1/communities/members.mts'],
  },
  {
    id: 'native.communities.moderator-cap.promotion.conflict',
    method: 'PATCH',
    path: `/api/v1/communities/${community.slug}/members/${banUserId}`,
    route: {
      routeTemplate: '/api/v1/communities/:idOrSlug/members/:userId',
      pathParams: { idOrSlug: community.slug, userId: banUserId },
    },
    requestBody: { role: 'moderator' },
    auth: 'fixture-user',
    status: 409,
    backendResponseContractKey: 'PATCH:/api/v1/communities/:idOrSlug/members/:userId#moderator-cap',
    body: {
      message: 'Community moderator limit reached',
      code: 'COMMUNITY_MODERATOR_LIMIT_REACHED',
    },
    consumers: [...nativeBanConsumers],
    migratedFrom: ['backend/api/v1/communities/members.mts'],
  },
]
