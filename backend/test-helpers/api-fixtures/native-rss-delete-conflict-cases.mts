import type { ApiFixtureCase } from './types.mts'

const feedId = '70000000-0000-7000-8000-000000003680'

export const nativeRssDeleteConflictApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.rss-feeds.delete.retained-import-conflict',
    method: 'DELETE',
    path: `/api/v1/rss-feeds/${feedId}`,
    route: { routeTemplate: '/api/v1/rss-feeds/:id', pathParams: { id: feedId } },
    auth: 'fixture-admin',
    status: 409,
    backendResponseContractKey: 'DELETE:/api/v1/rss-feeds/:id#conflict',
    body: {
      message: 'Feed is referenced by admin import history',
      code: 'RSS_FEED_ADMIN_IMPORT_REFERENCED',
    },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/services/rss-feeds/delete.mts'],
  },
]
