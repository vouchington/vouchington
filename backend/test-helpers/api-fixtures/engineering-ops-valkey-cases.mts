import { responseBody } from './static-response-bodies.mts'
import type { ApiFixtureCase } from './types.mts'

export const engineeringConsumers = ['web', 'dotnet-core', 'swift-core', 'swift-ui'] as const

function fixtureCase(
  fixture: Omit<ApiFixtureCase, 'auth' | 'body' | 'consumers' | 'migratedFrom' | 'status'>,
): ApiFixtureCase {
  return {
    ...fixture,
    auth: 'fixture-admin',
    consumers: [...engineeringConsumers],
    body: responseBody(fixture.id),
    migratedFrom: ['backend/api/v1/valkey/index.mts'],
    status: 200,
  }
}

export const engineeringOpsValkeyApiFixtureCases: ApiFixtureCase[] = [
  fixtureCase({
    id: 'web.admin.valkey.bloom-filters.rebuild.default',
    method: 'POST',
    path: '/api/v1/valkey/bloom-filters/rebuild',
    route: { routeTemplate: '/api/v1/valkey/bloom-filters/rebuild' },
    requestBody: { filter: 'entity-cache' },
  }),
  fixtureCase({
    id: 'web.admin.valkey.cache-groups.default',
    method: 'GET',
    path: '/api/v1/valkey/cache-groups',
    route: { routeTemplate: '/api/v1/valkey/cache-groups' },
  }),
  fixtureCase({
    id: 'web.admin.valkey.caches.clear.default',
    method: 'POST',
    path: '/api/v1/valkey/caches/clear',
    route: { routeTemplate: '/api/v1/valkey/caches/clear' },
    requestBody: { group: 'posts' },
  }),
  fixtureCase({
    id: 'web.admin.valkey.flush.default',
    method: 'POST',
    path: '/api/v1/valkey/flush',
    route: { routeTemplate: '/api/v1/valkey/flush' },
    requestBody: { concern: 'blooms' },
  }),
]
