import { community, pageInfo, timestamp, user } from './web-community-data.mts'
import type { ApiFixtureCase } from './types.mts'

export const webCommunitySavedReplyApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.communities.saved-replies.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/saved-replies`,
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/saved-replies',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [
        {
          id: '00000000-0000-7000-8000-000000000700',
          community_id: community.id,
          title: 'Greeting',
          body: 'Thanks for writing in.',
          order_index: 0,
          created_by_id: user.id,
          created_at: timestamp,
          updated_at: timestamp,
          deleted_at: null,
        },
      ],
      page_info: {
        ...pageInfo,
        start_cursor:
          'eyJyYW5raW5nIjowLCJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDcwMCJ9',
      },
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/saved-replies.mts'],
  },
  {
    id: 'web.communities.saved-reply.create.default',
    method: 'POST',
    path: `/api/v1/communities/${community.slug}/saved-replies`,
    requestBody: { title: 'Greeting', body: 'Thanks for writing in.' },
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/saved-replies',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 201,
    body: {
      reply: {
        id: '00000000-0000-7000-8000-000000000700',
        community_id: community.id,
        title: 'Greeting',
        body: 'Thanks for writing in.',
        order_index: 0,
        created_by_id: user.id,
        created_at: timestamp,
        updated_at: timestamp,
        deleted_at: null,
      },
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/saved-replies.mts'],
  },
  {
    id: 'web.communities.saved-replies.page-2',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/saved-replies`,
    query: {
      after: 'eyJyYW5raW5nIjowLCJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDcwMSJ9',
      limit: '25',
    },
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/saved-replies',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [
        {
          id: '00000000-0000-7000-8000-000000000702',
          community_id: community.id,
          title: 'Follow-up',
          body: 'Here is the earlier saved reply.',
          order_index: 1,
          created_by_id: user.id,
          created_at: timestamp,
          updated_at: timestamp,
          deleted_at: null,
        },
      ],
      page_info: {
        ...pageInfo,
        start_cursor:
          'eyJyYW5raW5nIjoxLCJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDcwMiJ9',
      },
    },
    consumers: ['swift-core', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/saved-replies.mts'],
  },
]
