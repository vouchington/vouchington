import { encodeScopedTierPreciseUuidCursor } from '@modules/pagination'
import { nativeModerationFixtureCase as fixtureCase } from './native-moderation-fixture-case.mts'

const ownerId = '00000000-0000-7000-8700-000000000101'
const postId = '00000000-0000-7000-8000-000000000201'
const cursorScope = `user-removed-posts:${ownerId}:removed-desc-kind-desc-post-desc:v2`
const firstPageCursor = encodeScopedTierPreciseUuidCursor(
  '2026-07-01T09:00:00.000000Z',
  0,
  postId,
  cursorScope,
)

export const nativeModerationMemberNoticeApiFixtureCases = [
  fixtureCase({
    id: 'native.moderation.removed-posts.default',
    backendResponseContractKey: 'GET:/api/v1/my/removed-posts#include-platform',
    method: 'GET',
    path: '/api/v1/my/removed-posts',
    query: { include_platform: 'true', limit: '25' },
    route: { routeTemplate: '/api/v1/my/removed-posts' },
    auth: 'fixture-user',
    body: {
      removed_posts: [
        {
          post_id: postId,
          post_title: 'A platform and community removed post',
          post_declared_language: null,
          post_lingua_rs_detected_language: 'en',
          community_id: '00000000-0000-7000-8000-000000000301',
          community_slug: 'fixture-community',
          unpublished_at: '2026-07-01T09:00:00.000000Z',
          post_removal_kind: 'platform',
          __entity_type: 'removed_post',
        },
        {
          post_id: postId,
          post_title: 'A platform and community removed post',
          post_declared_language: null,
          post_lingua_rs_detected_language: 'en',
          community_id: '00000000-0000-7000-8000-000000000301',
          community_slug: 'fixture-community',
          unpublished_at: '2026-07-01T09:00:00.000000Z',
          post_removal_kind: 'community',
          __entity_type: 'removed_post',
        },
      ],
      page_info: {
        has_next_page: true,
        start_cursor: encodeScopedTierPreciseUuidCursor(
          '2026-07-01T09:00:00.000000Z',
          1,
          postId,
          cursorScope,
        ),
        end_cursor: firstPageCursor,
      },
    },
    migratedFrom: ['backend/api/v1/my/removed-posts.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.removed-posts.page-2',
    backendResponseContractKey: 'GET:/api/v1/my/removed-posts#include-platform',
    method: 'GET',
    path: '/api/v1/my/removed-posts',
    query: { after: firstPageCursor, include_platform: 'true', limit: '25' },
    route: { routeTemplate: '/api/v1/my/removed-posts' },
    auth: 'fixture-user',
    body: {
      removed_posts: [
        {
          post_id: '00000000-0000-7000-8000-000000000202',
          post_title: 'A platform removed global post',
          post_declared_language: null,
          post_lingua_rs_detected_language: 'en',
          community_id: null,
          community_slug: null,
          unpublished_at: '2026-06-30T09:00:00.000000Z',
          post_removal_kind: 'platform',
          __entity_type: 'removed_post',
        },
      ],
      page_info: {
        has_next_page: false,
        start_cursor: encodeScopedTierPreciseUuidCursor(
          '2026-06-30T09:00:00.000000Z',
          1,
          '00000000-0000-7000-8000-000000000202',
          cursorScope,
        ),
        end_cursor: null,
      },
    },
    migratedFrom: ['backend/api/v1/my/removed-posts.mts'],
  }),
]
