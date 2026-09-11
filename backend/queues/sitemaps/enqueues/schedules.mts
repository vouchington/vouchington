import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import {
  BACKFILL_SCHEDULES,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
  SITEMAPS_ORDERING,
} from '../config.mts'
import { sitemaps } from '../queues.mts'
import type { SitemapDispatcherJobs } from '../types.mts'
import {
  enqueueMonthlyBackfillArchiveDispatcher,
  enqueueNightlyBackfillWeekDispatcher,
  enqueueWeeklyBackfillMonthDispatcher,
} from '../enqueues.mts'

const triggers = {
  processNightlyBackfillWeekDispatcher: enqueueNightlyBackfillWeekDispatcher,
  processWeeklyBackfillMonthDispatcher: enqueueWeeklyBackfillMonthDispatcher,
  processMonthlyBackfillArchiveDispatcher: enqueueMonthlyBackfillArchiveDispatcher,
} satisfies Record<SitemapDispatcherJobs, () => unknown>

const backfillIds = {
  processNightlyBackfillWeekDispatcher: 'sitemaps-nightly-week',
  processWeeklyBackfillMonthDispatcher: 'sitemaps-weekly-month',
  processMonthlyBackfillArchiveDispatcher: 'sitemaps-monthly-archive',
} satisfies Record<SitemapDispatcherJobs, string>

const descriptions = {
  processNightlyBackfillWeekDispatcher: 'Nightly sitemap backfill for the week',
  processWeeklyBackfillMonthDispatcher: 'Weekly sitemap backfill for the month',
  processMonthlyBackfillArchiveDispatcher: 'Monthly sitemap archive backfill',
} satisfies Record<SitemapDispatcherJobs, string>

export const scheduledJobManifest = defineScheduledJobManifest(
  QUEUE_NAME,
  BACKFILL_SCHEDULES.map(schedule => ({
    schedulerId: `sitemaps-backfill-${schedule.name}`,
    repeat: { pattern: schedule.pattern },
    template: {
      name: schedule.name as SitemapDispatcherJobs,
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: PRIORITY_DISPATCHER,
        ordering: SITEMAPS_ORDERING.dispatcher,
      } satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs' as const,
        id: `sitemaps-backfill-${schedule.name}`,
        schedule: schedule.pattern,
        description: descriptions[schedule.name],
        trigger: triggers[schedule.name],
      },
      { kind: 'backfill', backfillId: backfillIds[schedule.name] },
    ],
  })),
)

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(sitemaps, scheduledJobManifest)
}
