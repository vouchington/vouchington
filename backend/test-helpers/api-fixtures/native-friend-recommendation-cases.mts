import { user } from './data.mts'
import type { ApiFixtureCase } from './types.mts'

const consumers = ['web', 'swift-core', 'swift-ui', 'dotnet-core'] as const
const cursorScope = JSON.stringify({
  resource: 'my-friend-recommendations',
  owner_id: 'fixture-user',
  order: 'id-asc',
})
const firstCursor = Buffer.from(JSON.stringify({ id: user.id, scope: cursorScope })).toString(
  'base64url',
)
const secondFriendId = '019fafc1-308d-7db5-b834-6bbf641bf0e7'
const secondCursor = Buffer.from(
  JSON.stringify({ id: secondFriendId, scope: cursorScope }),
).toString('base64url')

export const nativeFriendRecommendationApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.friend-recommendations.default',
    method: 'GET',
    path: '/api/v1/my/friend-recommendations',
    query: { limit: '25' },
    route: { routeTemplate: '/api/v1/my/friend-recommendations' },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [
        {
          __entity_type: 'user',
          id: user.id,
          provider: 'github',
          provider_friend_name: 'Fixture Friend',
        },
      ],
      page_info: {
        has_next_page: true,
        start_cursor: firstCursor,
        end_cursor: firstCursor,
      },
      users: {
        [user.id]: {
          __entity_type: 'user',
          id: user.id,
          username: user.username,
          roles: [],
          profile_image_id: user.profile_image_id,
        },
      },
    },
    consumers: [...consumers],
    migratedFrom: [],
  },
  {
    id: 'native.friend-recommendations.second-page',
    method: 'GET',
    path: '/api/v1/my/friend-recommendations',
    query: { limit: '25', after: firstCursor },
    route: { routeTemplate: '/api/v1/my/friend-recommendations' },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [
        {
          __entity_type: 'user',
          id: user.id,
          provider: 'github',
          provider_friend_name: 'Repeated Fixture Friend',
        },
        {
          __entity_type: 'user',
          id: secondFriendId,
          provider: 'x',
          provider_friend_name: 'Second Fixture Friend',
        },
      ],
      page_info: {
        has_next_page: false,
        start_cursor: firstCursor,
        end_cursor: null,
      },
      users: {
        [user.id]: {
          __entity_type: 'user',
          id: user.id,
          username: user.username,
          roles: [],
          profile_image_id: user.profile_image_id,
        },
        [secondFriendId]: {
          __entity_type: 'user',
          id: secondFriendId,
          username: 'secondfriend',
          roles: [],
          profile_image_id: null,
        },
      },
    },
    consumers: [...consumers],
    migratedFrom: [],
  },
  {
    id: 'native.friend-recommendations.empty',
    method: 'GET',
    path: '/api/v1/my/friend-recommendations',
    query: { limit: '25', after: secondCursor },
    route: { routeTemplate: '/api/v1/my/friend-recommendations' },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [],
      page_info: {
        has_next_page: false,
        start_cursor: null,
        end_cursor: null,
      },
      users: {},
    },
    consumers: [...consumers],
    migratedFrom: [],
  },
]
