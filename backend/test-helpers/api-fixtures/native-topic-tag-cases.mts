import { responseBody } from './static-response-bodies.mts'
import type { ApiFixtureCase } from './types.mts'

const shared: Pick<ApiFixtureCase, 'auth' | 'consumers'> = {
  auth: 'fixture-user',
  consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
}

export const nativeTopicTagApiFixtureCases: ApiFixtureCase[] = [
  {
    ...shared,
    id: 'web.topics.publisher-types.default',
    method: 'GET',
    path: '/api/v1/topics/publisher-types',
    route: { routeTemplate: '/api/v1/topics/publisher-types' },
    status: 200,
    body: responseBody('web.topics.publisher-types.default'),
    migratedFrom: ['backend/api/v1/topics/__tests__/publisher-types.test.mts'],
  },
  {
    ...shared,
    id: 'native.topics.user-tags.default',
    method: 'GET',
    path: '/api/v1/topics/user-tags',
    route: { routeTemplate: '/api/v1/topics/user-tags' },
    status: 200,
    body: responseBody('native.topics.user-tags.default'),
    migratedFrom: [
      'backend/api/v1/entity-relations/__tests__/user-tags-authorization.test.mts',
      'https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/core/Tests/VouchaCoreTests/UserTagEndpointTests.swift',
    ],
  },
]
