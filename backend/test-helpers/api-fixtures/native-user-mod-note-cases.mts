import { nativeModerationFixtureCase as fixtureCase } from './native-moderation-fixture-case.mts'

const modNoteUserId = '00000000-0000-7000-8000-000000000911'
const modNote = {
  id: '00000000-0000-7000-8000-000000000912',
  created_at: '2026-06-01T12:00:00.000Z',
  target_user_id: modNoteUserId,
  author_user_id: '00000000-0000-7000-8000-000000000913',
  author_username: 'moderator',
  author_display_name: null,
  community_id: '00000000-0000-7000-8000-000000000914',
  community_name: 'Fixture community',
  body: 'Observed repeated spam.',
  deleted_at: null,
}

export const nativeUserModNoteApiFixtureCases = [
  fixtureCase({
    id: 'native.moderation.mod-notes.default',
    method: 'GET',
    path: `/api/v1/users/${modNoteUserId}/mod-notes`,
    query: { limit: '20' },
    route: {
      routeTemplate: '/api/v1/users/:userId/mod-notes',
      pathParams: { userId: modNoteUserId },
    },
    body: {
      notes: [
        modNote,
        {
          ...modNote,
          id: '00000000-0000-7000-8000-000000000910',
          author_username: null,
          author_display_name: null,
          community_name: null,
        },
      ],
      page_info: { has_next_page: false },
    },
    migratedFrom: ['backend/api/v1/users/mod-notes.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.mod-notes.create.default',
    method: 'POST',
    path: `/api/v1/users/${modNoteUserId}/mod-notes`,
    requestBody: { body: modNote.body, community_id: modNote.community_id },
    route: {
      routeTemplate: '/api/v1/users/:userId/mod-notes',
      pathParams: { userId: modNoteUserId },
    },
    status: 201,
    body: { note: modNote },
    migratedFrom: ['backend/api/v1/users/mod-notes.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.context.staff',
    method: 'GET',
    path: `/api/v1/users/${modNoteUserId}/moderation-context`,
    route: {
      routeTemplate: '/api/v1/users/:userId/moderation-context',
      pathParams: { userId: modNoteUserId },
    },
    body: {
      context: {
        account_age_ms: 86_400_000,
        trust_tier: 1,
        active_suspension: null,
        content_removal_count: 1000,
        content_removal_count_capped: true,
        community_removal_count: 2,
      },
      notes: [modNote],
      page_info: { has_next_page: false },
    },
    migratedFrom: ['backend/api/v1/users/mod-notes.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.context.member',
    method: 'GET',
    auth: 'fixture-user',
    path: `/api/v1/users/${modNoteUserId}/moderation-context`,
    route: {
      routeTemplate: '/api/v1/users/:userId/moderation-context',
      pathParams: { userId: modNoteUserId },
    },
    body: {
      context: {
        account_age_ms: 86_400_000,
        trust_tier: null,
        active_suspension: null,
        content_removal_count: null,
        content_removal_count_capped: null,
        community_removal_count: null,
      },
      notes: [modNote],
      page_info: { has_next_page: false },
    },
    migratedFrom: ['backend/api/v1/users/mod-notes.mts'],
  }),
]
