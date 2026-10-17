import { engineeringConsumers } from './engineering-ops-valkey-cases.mts'
import { responseBody } from './static-response-bodies.mts'
import type { ApiFixtureCase } from './types.mts'

function fixtureCase(
  fixture: Omit<ApiFixtureCase, 'auth' | 'body' | 'consumers' | 'status'>,
): ApiFixtureCase {
  return {
    ...fixture,
    auth: 'fixture-admin',
    consumers: [...engineeringConsumers],
    status: 200,
    body: responseBody(fixture.id),
  }
}

export const engineeringQueueDomainApiFixtureCases: ApiFixtureCase[] = [
  fixtureCase({
    id: 'web.admin.mq.queues.domains.default',
    method: 'GET',
    path: '/api/v1/mq/queues/background/domains',
    route: { routeTemplate: '/api/v1/mq/queues/:name/domains', pathParams: { name: 'background' } },
    migratedFrom: ['backend/api/v1/mq/index-routes/mq-queues-by-name-domains-get.mts'],
  }),
  fixtureCase({
    id: 'web.admin.mq.queues.domains.pause.default',
    method: 'POST',
    path: '/api/v1/mq/queues/background/domains/openai-moderation/pause',
    route: {
      routeTemplate: '/api/v1/mq/queues/:name/domains/:domain/pause',
      pathParams: { name: 'background', domain: 'openai-moderation' },
    },
    requestBody: { reason: 'Maintenance' },
    migratedFrom: [
      'backend/api/v1/mq/index-routes/mq-queues-by-name-domains-by-domain-pause-post.mts',
    ],
  }),
  fixtureCase({
    id: 'web.admin.mq.queues.domains.resume.default',
    method: 'POST',
    path: '/api/v1/mq/queues/background/domains/openai-moderation/resume',
    route: {
      routeTemplate: '/api/v1/mq/queues/:name/domains/:domain/resume',
      pathParams: { name: 'background', domain: 'openai-moderation' },
    },
    migratedFrom: [
      'backend/api/v1/mq/index-routes/mq-queues-by-name-domains-by-domain-resume-post.mts',
    ],
  }),
  fixtureCase({
    id: 'web.admin.mq.queues.domains.retry-failed.default',
    method: 'POST',
    path: '/api/v1/mq/queues/background/domains/openai-moderation/retry-failed',
    route: {
      routeTemplate: '/api/v1/mq/queues/:name/domains/:domain/retry-failed',
      pathParams: { name: 'background', domain: 'openai-moderation' },
    },
    migratedFrom: [
      'backend/api/v1/mq/index-routes/mq-queues-by-name-domains-by-domain-retry-failed-post.mts',
    ],
  }),
]
