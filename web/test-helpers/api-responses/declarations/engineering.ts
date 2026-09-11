import adminArticleSyncStatusActive from '../../../../api-fixtures/v1/responses/web.admin.article-syncs.status.active.json'
import adminArticleSyncTriggerDefault from '../../../../api-fixtures/v1/responses/web.admin.article-syncs.trigger.default.json'
import adminMqBackfillsDefault from '../../../../api-fixtures/v1/responses/web.admin.mq.backfills.default.json'
import adminMqBackfillsTriggerDefault from '../../../../api-fixtures/v1/responses/web.admin.mq.backfills.trigger.default.json'
import adminMqQueuesDefault from '../../../../api-fixtures/v1/responses/web.admin.mq.queues.default.json'
import adminMqQueuesPauseDefault from '../../../../api-fixtures/v1/responses/web.admin.mq.queues.pause.default.json'
import adminMqQueuesResumeDefault from '../../../../api-fixtures/v1/responses/web.admin.mq.queues.resume.default.json'
import adminMqScheduledJobsDefault from '../../../../api-fixtures/v1/responses/web.admin.mq.scheduled-jobs.default.json'
import adminMqScheduledJobsTriggerDefault from '../../../../api-fixtures/v1/responses/web.admin.mq.scheduled-jobs.trigger.default.json'
import adminMqStatsDefault from '../../../../api-fixtures/v1/responses/web.admin.mq.stats.default.json'
import adminPsqlJobsDefault from '../../../../api-fixtures/v1/responses/web.admin.psql.jobs.default.json'
import adminPsqlMigrationsDefault from '../../../../api-fixtures/v1/responses/web.admin.psql.migrations.default.json'
import adminPsqlPartitionsDefault from '../../../../api-fixtures/v1/responses/web.admin.psql.partitions.default.json'
import adminValkeyBloomFiltersRebuildDefault from '../../../../api-fixtures/v1/responses/web.admin.valkey.bloom-filters.rebuild.default.json'
import adminValkeyCacheGroupsDefault from '../../../../api-fixtures/v1/responses/web.admin.valkey.cache-groups.default.json'
import adminValkeyCachesClearDefault from '../../../../api-fixtures/v1/responses/web.admin.valkey.caches.clear.default.json'
import adminValkeyFlushDefault from '../../../../api-fixtures/v1/responses/web.admin.valkey.flush.default.json'
import growthMetricsDefault from '../../../../api-fixtures/v1/responses/web.growth-metrics.default.json'
import type { Backfill, QueueStats, QueueStatsSummary, ScheduledJob } from '@/lib/api/client/mq'
import type { ArticleSyncJobStatus } from '@/lib/api/client/admin'
import type { FlushValkeyResponseBody } from '@/types/api-responses'
import type {
  CacheGroupsResponseBody,
  ClearCacheResponseBody,
  MigrationStatusResponse,
  PartitionStatusResponseBody,
  PsqlJobEnqueueResponse,
  RebuildBloomFilterResponse,
} from '@/types/api-responses/memberships-referrals-and-admin'
import type { GrowthMetrics } from '@/types/growth-metrics'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

export const ENGINEERING_DECLARATIONS = [
  defineWebApiFixture<{ jobId: string }>()(
    'web.admin.article-syncs.trigger.default',
    adminArticleSyncTriggerDefault,
    context => context.client.admin.triggerArticleSync(),
  ),
  defineWebApiFixture<ArticleSyncJobStatus>()(
    'web.admin.article-syncs.status.active',
    adminArticleSyncStatusActive,
    context => context.client.admin.getArticleSyncStatus('job-1'),
  ),
  defineWebApiFixture<{ stats: QueueStatsSummary }>()(
    'web.admin.mq.stats.default',
    adminMqStatsDefault,
    context => context.client.mq.fetchQueueStats(),
  ),
  defineWebApiFixture<{ queues: QueueStats[]; total: number }>()(
    'web.admin.mq.queues.default',
    adminMqQueuesDefault,
    context => context.client.mq.fetchQueues(),
  ),
  defineWebApiFixture<{ success: boolean }>()(
    'web.admin.mq.queues.pause.default',
    adminMqQueuesPauseDefault,
    context => context.client.mq.pauseQueue('psql'),
  ),
  defineWebApiFixture<{ success: boolean }>()(
    'web.admin.mq.queues.resume.default',
    adminMqQueuesResumeDefault,
    context => context.client.mq.resumeQueue('psql'),
  ),
  defineWebApiFixture<{ jobs: ScheduledJob[] }>()(
    'web.admin.mq.scheduled-jobs.default',
    adminMqScheduledJobsDefault,
    context => context.client.mq.fetchScheduledJobs(),
  ),
  defineWebApiFixture<{ success: boolean }>()(
    'web.admin.mq.scheduled-jobs.trigger.default',
    adminMqScheduledJobsTriggerDefault,
    context => context.client.mq.triggerScheduledJob('kagi-smallweb-sync'),
  ),
  defineWebApiFixture<{ backfills: Backfill[] }>()(
    'web.admin.mq.backfills.default',
    adminMqBackfillsDefault,
    context => context.client.mq.fetchBackfills(),
  ),
  defineWebApiFixture<{ success: boolean }>()(
    'web.admin.mq.backfills.trigger.default',
    adminMqBackfillsTriggerDefault,
    context => context.client.mq.triggerBackfill('openai-moderation-posts'),
  ),
  defineWebApiFixture<MigrationStatusResponse>()(
    'web.admin.psql.migrations.default',
    adminPsqlMigrationsDefault,
    context => context.client.psql.fetchMigrations(),
    [context => context.server.psql.getMigrationStatus()],
  ),
  defineWebApiFixture<PartitionStatusResponseBody>()(
    'web.admin.psql.partitions.default',
    adminPsqlPartitionsDefault,
    context => context.client.psql.fetchPartitions(),
    [context => context.server.psql.getPartitionStatus()],
  ),
  defineWebApiFixture<PsqlJobEnqueueResponse>()(
    'web.admin.psql.jobs.default',
    adminPsqlJobsDefault,
    context => context.client.psql.enqueuePsqlJob('runConfigDriven'),
  ),
  defineWebApiFixture<RebuildBloomFilterResponse>()(
    'web.admin.valkey.bloom-filters.rebuild.default',
    adminValkeyBloomFiltersRebuildDefault,
    context => context.client.valkey.rebuildBloomFilter('entity-cache'),
  ),
  defineWebApiFixture<CacheGroupsResponseBody>()(
    'web.admin.valkey.cache-groups.default',
    adminValkeyCacheGroupsDefault,
    context => context.client.valkey.fetchCacheGroups(),
  ),
  defineWebApiFixture<ClearCacheResponseBody>()(
    'web.admin.valkey.caches.clear.default',
    adminValkeyCachesClearDefault,
    context => context.client.valkey.clearCache('posts'),
  ),
  defineWebApiFixture<FlushValkeyResponseBody>()(
    'web.admin.valkey.flush.default',
    adminValkeyFlushDefault,
    context => context.client.valkey.flushValkey('blooms'),
  ),
  defineWebApiFixture<GrowthMetrics>()(
    'web.growth-metrics.default',
    growthMetricsDefault,
    context => context.server.growthMetrics.getGrowthMetrics({ range: '30d' }),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
