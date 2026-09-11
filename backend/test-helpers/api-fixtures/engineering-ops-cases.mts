import {
  engineeringConsumers,
  engineeringOpsValkeyApiFixtureCases,
} from './engineering-ops-valkey-cases.mts'
import { responseBody } from './static-response-bodies.mts'
import type { ApiFixtureCase } from './types.mts'

function fixtureCase(fixture: Omit<ApiFixtureCase, 'auth' | 'body' | 'consumers'>): ApiFixtureCase {
  return {
    ...fixture,
    auth: 'fixture-admin',
    consumers: [...engineeringConsumers],
    body: responseBody(fixture.id),
  }
}

export const engineeringOpsApiFixtureCases: ApiFixtureCase[] = [
  fixtureCase({
    id: 'web.admin.article-syncs.trigger.default',
    method: 'POST',
    path: '/api/v1/article-syncs',
    route: { routeTemplate: '/api/v1/article-syncs' },
    status: 202,
    migratedFrom: ['backend/api/v1/admin/article-syncs.mts'],
  }),
  fixtureCase({
    id: 'web.admin.article-syncs.status.active',
    method: 'GET',
    path: '/api/v1/article-syncs/job-1',
    route: {
      routeTemplate: '/api/v1/article-syncs/:jobId',
      pathParams: { jobId: 'job-1' },
    },
    backendResponseContractKey: 'GET:/api/v1/article-syncs/:jobId#active',
    status: 200,
    migratedFrom: ['backend/api/v1/admin/article-syncs.mts'],
  }),
  fixtureCase({
    id: 'web.admin.mq.stats.default',
    method: 'GET',
    path: '/api/v1/mq/stats',
    route: { routeTemplate: '/api/v1/mq/stats' },
    status: 200,
    migratedFrom: ['backend/api/v1/mq/index-routes/mq-stats-get.mts'],
  }),
  fixtureCase({
    id: 'web.admin.mq.queues.default',
    method: 'GET',
    path: '/api/v1/mq/queues',
    route: { routeTemplate: '/api/v1/mq/queues' },
    status: 200,
    migratedFrom: ['backend/api/v1/mq/index-routes/mq-queues-get.mts'],
  }),
  fixtureCase({
    id: 'web.admin.mq.queues.pause.default',
    method: 'POST',
    path: '/api/v1/mq/queues/psql/pause',
    route: {
      routeTemplate: '/api/v1/mq/queues/:name/pause',
      pathParams: { name: 'psql' },
    },
    status: 200,
    migratedFrom: ['backend/api/v1/mq/index-routes/mq-queues-by-name-pause-post.mts'],
  }),
  fixtureCase({
    id: 'web.admin.mq.queues.resume.default',
    method: 'POST',
    path: '/api/v1/mq/queues/psql/resume',
    route: {
      routeTemplate: '/api/v1/mq/queues/:name/resume',
      pathParams: { name: 'psql' },
    },
    status: 200,
    migratedFrom: ['backend/api/v1/mq/index-routes/mq-queues-by-name-resume-post.mts'],
  }),
  fixtureCase({
    id: 'web.admin.mq.scheduled-jobs.default',
    method: 'GET',
    path: '/api/v1/mq/scheduled-jobs',
    route: { routeTemplate: '/api/v1/mq/scheduled-jobs' },
    status: 200,
    migratedFrom: ['backend/api/v1/mq/scheduled-jobs.mts'],
  }),
  fixtureCase({
    id: 'web.admin.mq.scheduled-jobs.trigger.default',
    method: 'POST',
    path: '/api/v1/mq/scheduled-jobs/kagi-smallweb-sync/runs',
    route: {
      routeTemplate: '/api/v1/mq/scheduled-jobs/:id/runs',
      pathParams: { id: 'kagi-smallweb-sync' },
    },
    status: 200,
    migratedFrom: ['backend/api/v1/mq/scheduled-jobs.mts'],
  }),
  fixtureCase({
    id: 'web.admin.mq.backfills.default',
    method: 'GET',
    path: '/api/v1/mq/backfills',
    route: { routeTemplate: '/api/v1/mq/backfills' },
    status: 200,
    migratedFrom: ['backend/api/v1/mq/backfills.mts'],
  }),
  fixtureCase({
    id: 'web.admin.mq.backfills.trigger.default',
    method: 'POST',
    path: '/api/v1/mq/backfills/openai-moderation-posts/runs',
    route: {
      routeTemplate: '/api/v1/mq/backfills/:id/runs',
      pathParams: { id: 'openai-moderation-posts' },
    },
    status: 200,
    migratedFrom: ['backend/api/v1/mq/backfills.mts'],
  }),
  fixtureCase({
    id: 'web.admin.psql.migrations.default',
    method: 'GET',
    path: '/api/v1/psql/migrations',
    route: { routeTemplate: '/api/v1/psql/migrations' },
    status: 200,
    migratedFrom: ['backend/api/v1/psql/index.mts'],
  }),
  fixtureCase({
    id: 'web.admin.psql.partitions.default',
    method: 'GET',
    path: '/api/v1/psql/partitions',
    route: { routeTemplate: '/api/v1/psql/partitions' },
    status: 200,
    migratedFrom: ['backend/api/v1/psql/index.mts'],
  }),
  fixtureCase({
    id: 'web.admin.psql.jobs.default',
    method: 'POST',
    path: '/api/v1/psql/jobs',
    route: { routeTemplate: '/api/v1/psql/jobs' },
    requestBody: { type: 'runConfigDriven' },
    status: 200,
    migratedFrom: ['backend/api/v1/psql/index.mts'],
  }),
  ...engineeringOpsValkeyApiFixtureCases,
]
