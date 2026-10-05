import { community, pageInfo, timestamp, user } from './web-community-data.mts'
import type { ApiFixtureCase } from './types.mts'

export const webCommunityModmailApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.communities.modmail.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/modmail`,
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/modmail',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: { results: [], page_info: pageInfo },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/modmail.mts'],
  },
  {
    id: 'web.communities.modmail-messages.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/modmail/00000000-0000-7000-8000-000000000501/messages`,
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/modmail/:threadId/messages',
      pathParams: {
        communitySlug: community.slug,
        threadId: '00000000-0000-7000-8000-000000000501',
      },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [
        {
          id: '00000000-0000-7000-8000-000000000602',
          conversation_id: '00000000-0000-7000-8000-000000000501',
          body_text: 'Please review this moderation thread.',
          created_by_id: user.id,
          sender_username: user.username,
          created_at: timestamp,
          updated_at: timestamp,
          deleted_at: null,
        },
      ],
      page_info: {
        ...pageInfo,
        start_cursor: 'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDYwMiJ9',
      },
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/modmail.mts'],
  },
  {
    id: 'web.communities.modmail.page-2',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/modmail`,
    query: {
      after:
        'eyJ0aW1lc3RhbXAiOiIyMDI2LTA3LTAxVDEyOjAwOjAwLjAwMDAwMFoiLCJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDUwMSJ9',
      limit: '25',
    },
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/modmail',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [
        {
          id: '00000000-0000-7000-8000-000000000502',
          channel_type: 'modmail',
          title: '',
          community_id: community.id,
          subject_user_id: user.id,
          assigned_moderator_user_id: null,
          assigned_at: null,
          resolved_at: null,
          resolved_by_id: null,
          created_by_id: user.id,
          created_at: timestamp,
          updated_at: timestamp,
        },
      ],
      page_info: {
        ...pageInfo,
        start_cursor:
          'eyJ0aW1lc3RhbXAiOiIyMDI2LTAxLTAxVDAwOjAwOjAwLjAwMDAwMFoiLCJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDUwMiJ9',
      },
    },
    consumers: ['swift-core', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/modmail.mts'],
  },
  {
    id: 'web.communities.modmail-messages.page-2',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/modmail/00000000-0000-7000-8000-000000000501/messages`,
    query: {
      after: 'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDYwMSJ9',
      limit: '25',
    },
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/modmail/:threadId/messages',
      pathParams: {
        communitySlug: community.slug,
        threadId: '00000000-0000-7000-8000-000000000501',
      },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [
        {
          id: '00000000-0000-7000-8000-000000000600',
          conversation_id: '00000000-0000-7000-8000-000000000501',
          body_text: 'Earlier modmail context.',
          created_by_id: user.id,
          sender_username: user.username,
          created_at: timestamp,
          updated_at: timestamp,
          deleted_at: null,
        },
      ],
      page_info: {
        ...pageInfo,
        start_cursor: 'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDYwMCJ9',
      },
    },
    consumers: ['swift-core', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/modmail-messages.mts'],
  },
]
