import { encodeScopedUuidCursor } from '@modules/pagination'
import type { ApiFixtureCase } from './types.mts'

const topicId = '70000000-0000-7000-8000-000000005381'
const feedId = '70000000-0000-7000-8000-000000005382'
const importId = '70000000-0000-7000-8000-000000005383'
const importRowId = '70000000-0000-7000-8000-000000005384'
const createdAt = '2026-11-01T00:00:00.000Z'
const limitError = { message: 'Relation limit reached', code: 'RELATION_LIMIT_REACHED' }
const shared: Pick<ApiFixtureCase, 'auth' | 'consumers'> = {
  auth: 'fixture-user',
  consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
}

export const nativeRelationLimitApiFixtureCases: ApiFixtureCase[] = [
  {
    ...shared,
    id: 'native.relation-limits.topic-follow.conflict',
    pending: true,
    method: 'PUT',
    path: `/api/v1/bookmarks/topic/${topicId}/follow`,
    route: {
      routeTemplate: '/api/v1/bookmarks/:entityType/:entityId/:predicate',
      pathParams: { entityType: 'topic', entityId: topicId, predicate: 'follow' },
    },
    status: 409,
    backendResponseContractKey:
      'PUT:/api/v1/bookmarks/:entityType/:entityId/:predicate#relation-limit',
    body: limitError,
    migratedFrom: ['backend/api/v1/bookmarks/relation-limits.test.mts'],
  },
  {
    ...shared,
    id: 'native.relation-limits.rss-subscribe.conflict',
    pending: true,
    method: 'PUT',
    path: `/api/v1/bookmarks/rss_feed/${feedId}/subscribe`,
    route: {
      routeTemplate: '/api/v1/bookmarks/:entityType/:entityId/:predicate',
      pathParams: { entityType: 'rss_feed', entityId: feedId, predicate: 'subscribe' },
    },
    status: 409,
    backendResponseContractKey:
      'PUT:/api/v1/bookmarks/:entityType/:entityId/:predicate#relation-limit',
    body: limitError,
    migratedFrom: ['backend/api/v1/bookmarks/bookmarks.mts'],
  },
  {
    ...shared,
    id: 'native.relation-limits.topics.import.skipped',
    pending: true,
    method: 'POST',
    path: '/api/v1/my/import/topics',
    route: { routeTemplate: '/api/v1/my/import/topics' },
    requestBody: { names: ['Local News'] },
    status: 200,
    body: {
      results: [
        {
          input: 'Local News',
          status: 'skipped',
          error_code: 'RELATION_LIMIT_REACHED',
          entity_id: topicId,
        },
      ],
    },
    migratedFrom: ['backend/services/user-import-export/import-topics.test.mts'],
  },
  {
    ...shared,
    id: 'native.relation-limits.rss-feeds.import.skipped',
    pending: true,
    method: 'GET',
    path: `/api/v1/my/import/rss-feeds/${importId}`,
    route: {
      routeTemplate: '/api/v1/my/import/rss-feeds/:importId',
      pathParams: { importId },
    },
    status: 200,
    body: {
      import: {
        id: importId,
        total_rows: 1,
        completed_rows: 0,
        skipped_rows: 1,
        failed_rows: 1,
        pending_rows: 0,
        completed_at: '2026-11-01T00:01:00.000Z',
        created_at: createdAt,
      },
      rows: [
        {
          id: importRowId,
          input: 'https://example.com/feed.xml',
          status: 'error',
          error_code: 'RELATION_LIMIT_REACHED',
          entity_id: feedId,
        },
      ],
      page_info: {
        has_next_page: false,
        start_cursor: encodeScopedUuidCursor(
          importRowId,
          `rss-feed-import-rows:${importId}:row-index-asc`,
        ),
        end_cursor: null,
      },
    },
    migratedFrom: ['backend/services/user-import-export/rss-feed-import-row-updates.test.mts'],
  },
]
