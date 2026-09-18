import type { ApiFixtureCase } from './types.mts'
import { predecessorIssue } from './predecessor-issue.mts'

const importId = '70000000-0000-7000-8000-000000000001'
const firstRowId = '70000000-0000-7000-8000-000000000002'
const secondRowId = '70000000-0000-7000-8000-000000000003'
const feedId = '70000000-0000-7000-8000-000000000004'
const topicId = '70000000-0000-7000-8000-000000000005'
const recommendationId = '70000000-0000-7000-8000-000000000006'
const createdAt = '2026-07-14T12:00:00.000Z'
const exportedTopics = [
  { name: 'Local News', slug: 'local-news', topic_type: 'topic' },
  { name: 'Travel', slug: 'travel', topic_type: 'topic' },
]

const shared: Pick<ApiFixtureCase, 'auth' | 'consumers' | 'migratedFrom'> = {
  auth: 'fixture-user',
  consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
  migratedFrom: [predecessorIssue(7887)],
}

export const nativeImportExportApiFixtureCases: ApiFixtureCase[] = [
  {
    ...shared,
    id: 'native.import-export.rss-feeds.submit.default',
    method: 'POST',
    path: '/api/v1/my/import/rss-feeds',
    route: { routeTemplate: '/api/v1/my/import/rss-feeds' },
    requestBody: {
      urls: ['https://example.test/feed.xml', 'https://invalid.example.test/feed.xml'],
      follow: true,
    },
    status: 201,
    body: {
      import: {
        id: importId,
        total_rows: 2,
        completed_rows: 0,
        failed_rows: 0,
        pending_rows: 2,
        completed_at: null,
        created_at: createdAt,
      },
      status_url: `/api/v1/my/import/rss-feeds/${importId}`,
    },
  },
  {
    ...shared,
    id: 'native.import-export.rss-feeds.status.retrying',
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
        total_rows: 2,
        completed_rows: 0,
        failed_rows: 0,
        pending_rows: 2,
        completed_at: null,
        created_at: createdAt,
      },
      rows: [
        {
          id: firstRowId,
          input: 'https://example.test/feed.xml',
          status: 'pending',
          error: 'Temporary source fetch failure. Retrying.',
        },
        {
          id: secondRowId,
          input: 'https://invalid.example.test/feed.xml',
          status: 'pending',
        },
      ],
    },
  },
  {
    ...shared,
    id: 'native.import-export.rss-feeds.status.partial',
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
        total_rows: 2,
        completed_rows: 1,
        failed_rows: 1,
        pending_rows: 0,
        completed_at: '2026-07-14T12:01:00.000Z',
        created_at: createdAt,
      },
      rows: [
        {
          id: firstRowId,
          input: 'https://example.test/feed.xml',
          status: 'followed',
          entity_id: feedId,
        },
        {
          id: secondRowId,
          input: 'https://invalid.example.test/feed.xml',
          status: 'error',
          error: 'No RSS or Atom feed was found.',
        },
      ],
    },
  },
  {
    ...shared,
    id: 'native.import-export.topics.import.outcomes',
    method: 'POST',
    path: '/api/v1/my/import/topics',
    route: { routeTemplate: '/api/v1/my/import/topics' },
    requestBody: { names: ['Travel', 'Local News', 'Travel', '!!!'] },
    status: 200,
    body: {
      results: [
        { input: 'Travel', status: 'followed', entity_id: topicId },
        {
          input: 'Local News',
          status: 'recommendation_created',
          recommendation_post_id: recommendationId,
        },
        { input: 'Travel', status: 'already_following', entity_id: topicId },
        {
          input: '!!!',
          status: 'error',
          error: 'Could not derive a valid slug from name',
        },
      ],
    },
  },
  {
    ...shared,
    id: 'native.import-export.topics.export.default',
    method: 'GET',
    path: '/api/v1/my/export/topics',
    route: { routeTemplate: '/api/v1/my/export/topics' },
    backendResponseContractKey: 'GET:/api/v1/my/export/topics#default',
    status: 200,
    body: { results: exportedTopics },
  },
  {
    ...shared,
    id: 'native.import-export.topics.export.download',
    method: 'GET',
    path: '/api/v1/my/export/topics',
    route: { routeTemplate: '/api/v1/my/export/topics' },
    query: { download: '1' },
    backendResponseContractKey: 'GET:/api/v1/my/export/topics#download',
    status: 200,
    body: exportedTopics,
  },
]
