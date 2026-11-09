import { encodeScopedUuidCursor } from '@modules/pagination'
import type { ApiFixtureCase } from './types.mts'

const shared: Pick<ApiFixtureCase, 'auth' | 'consumers'> = {
  auth: 'fixture-user',
  consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
}

const feedId = '70000000-0000-7000-8000-000000003680'
const importId = '70000000-0000-7000-8000-000000003681'
const importRowId = '70000000-0000-7000-8000-000000003682'
const sourceTopicId = '70000000-0000-7000-8000-000000005170'
const destinationTopicId = '70000000-0000-7000-8000-000000005171'
const operationId = '70000000-0000-7000-8000-000000005172'
const createdAt = '2026-11-01T00:00:00.000Z'
const statusUrl = `/api/v1/my/import/rss-feeds/${importId}`
const mergeStatusUrl = `/api/v1/topics/${sourceTopicId}/merges/${operationId}`
const importSummary = {
  id: importId,
  total_rows: 1,
  completed_rows: 0,
  skipped_rows: 0,
  failed_rows: 0,
  pending_rows: 1,
  completed_at: null,
  created_at: createdAt,
}
const importPageInfo = {
  has_next_page: false,
  start_cursor: encodeScopedUuidCursor(
    importRowId,
    `rss-feed-import-rows:${importId}:row-index-asc`,
  ),
  end_cursor: null,
}
const mergeBase = {
  id: operationId,
  source_topic_id: sourceTopicId,
  destination_topic_id: destinationTopicId,
  status: 'queued',
  stage: 'preflight',
  created_at: createdAt,
  completed_at: null,
  error_code: null,
  status_url: mergeStatusUrl,
}
const mergeRoute = {
  routeTemplate: '/api/v1/topics/:sourceIdOrSlug/merges/:operationId',
  pathParams: { sourceIdOrSlug: sourceTopicId, operationId },
}
const createStatusRoute = {
  routeTemplate: '/api/v1/my/import/rss-feeds/:importId',
  pathParams: { importId },
}

export const nativeAsyncContentContractApiFixtureCases: ApiFixtureCase[] = [
  {
    ...shared,
    id: 'native.rss-feeds.delete.accepted',
    auth: 'fixture-admin',
    method: 'DELETE',
    path: `/api/v1/rss-feeds/${feedId}`,
    route: { routeTemplate: '/api/v1/rss-feeds/:id', pathParams: { id: feedId } },
    status: 202,
    body: { rss_feed_id: feedId, status: 'deleting' },
    migratedFrom: [
      'backend/api/v1/rss-feeds/__tests__/index.get-latest-crawl-membership-gating.test.mts',
    ],
  },
  {
    ...shared,
    id: 'native.topics.merge.accepted',
    auth: 'fixture-admin',
    method: 'POST',
    path: `/api/v1/topics/${sourceTopicId}/merges`,
    route: {
      routeTemplate: '/api/v1/topics/:sourceIdOrSlug/merges',
      pathParams: { sourceIdOrSlug: sourceTopicId },
    },
    requestBody: { destination_id_or_slug: destinationTopicId },
    status: 202,
    body: { topic_merge: mergeBase },
    migratedFrom: ['backend/api/v1/topics/merges.test.mts'],
  },
  ...(['queued', 'running', 'completed', 'failed'] as const).map(status => ({
    ...shared,
    id: `native.topics.merge.status.${status}`,
    auth: 'fixture-admin' as const,
    method: 'GET' as const,
    path: mergeStatusUrl,
    route: mergeRoute,
    status: 200,
    body: {
      topic_merge: {
        ...mergeBase,
        status,
        stage:
          status === 'running'
            ? 'references'
            : status === 'completed'
              ? 'cleanup'
              : status === 'failed'
                ? 'cleanup_failed'
                : 'preflight',
        completed_at: status === 'completed' ? '2026-11-01T00:01:00.000Z' : null,
        error_code: status === 'failed' ? 'topic_merge_reference_conflict' : null,
      },
    },
    migratedFrom: ['backend/api/v1/topics/merges.test.mts'],
  })),
  {
    ...shared,
    id: 'native.rss-feeds.create.accepted',
    method: 'POST',
    path: '/api/v1/rss-feeds',
    route: { routeTemplate: '/api/v1/rss-feeds' },
    requestBody: { rss_feed_url: 'https://example.test/feed.xml', follow: true },
    status: 202,
    body: { import: importSummary, status_url: statusUrl },
    migratedFrom: ['backend/api/v1/rss-feeds/__tests__/index.post-api-v1-rss-feeds.test.mts'],
  },
  {
    ...shared,
    id: 'native.rss-feeds.create.status.pending',
    method: 'GET',
    path: statusUrl,
    route: createStatusRoute,
    status: 200,
    body: {
      import: importSummary,
      rows: [{ id: importRowId, input: 'https://example.test/feed.xml', status: 'pending' }],
      page_info: importPageInfo,
    },
    migratedFrom: ['backend/api/v1/rss-feeds/__tests__/index.post-api-v1-rss-feeds.test.mts'],
  },
  {
    ...shared,
    id: 'native.rss-feeds.create.status.completed',
    method: 'GET',
    path: statusUrl,
    route: createStatusRoute,
    status: 200,
    body: {
      import: {
        ...importSummary,
        completed_rows: 1,
        pending_rows: 0,
        completed_at: '2026-11-01T00:01:00.000Z',
      },
      rows: [
        {
          id: importRowId,
          input: 'https://example.test/feed.xml',
          status: 'source_created',
          entity_id: feedId,
        },
      ],
      page_info: importPageInfo,
    },
    migratedFrom: ['backend/api/v1/rss-feeds/__tests__/index.post-api-v1-rss-feeds.test.mts'],
  },
  {
    ...shared,
    id: 'native.rss-feeds.create.status.failed',
    method: 'GET',
    path: statusUrl,
    route: createStatusRoute,
    status: 200,
    body: {
      import: {
        ...importSummary,
        failed_rows: 1,
        pending_rows: 0,
        completed_at: '2026-11-01T00:01:00.000Z',
      },
      rows: [
        {
          id: importRowId,
          input: 'https://example.test/feed.xml',
          status: 'error',
          error_code: 'IMPORT_FAILED',
        },
      ],
      page_info: importPageInfo,
    },
    migratedFrom: ['backend/api/v1/rss-feeds/__tests__/index.post-api-v1-rss-feeds.test.mts'],
  },
]
