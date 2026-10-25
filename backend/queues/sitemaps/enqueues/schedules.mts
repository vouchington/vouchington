import { defineScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { toSchedulerTemplateOptions } from '@vouchington/worker-runtime/schedule-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  SITEMAPS_MONTHLY_BACKFILL_JOB,
  SITEMAPS_NIGHTLY_BACKFILL_JOB,
  SITEMAPS_WEEKLY_BACKFILL_JOB,
} from '@queues/background/enqueues/sitemaps-jobs'
import { SITEMAPS_ORDERING } from '@queues/background/enqueues/sitemaps-ordering'
import { BACKFILL_SCHEDULES } from '../config.mts'
import {
  enqueueMonthlyBackfillArchiveDispatcher,
  enqueueNightlyBackfillWeekDispatcher,
  enqueueWeeklyBackfillMonthDispatcher,
} from '../enqueues.mts'

type ScheduleName = (typeof BACKFILL_SCHEDULES)[number]['name']

const jobs = {
  processNightlyBackfillWeekDispatcher: SITEMAPS_NIGHTLY_BACKFILL_JOB,
  processWeeklyBackfillMonthDispatcher: SITEMAPS_WEEKLY_BACKFILL_JOB,
  processMonthlyBackfillArchiveDispatcher: SITEMAPS_MONTHLY_BACKFILL_JOB,
} satisfies Record<ScheduleName, { name: string; options: object }>

const triggers = {
  processNightlyBackfillWeekDispatcher: enqueueNightlyBackfillWeekDispatcher,
  processWeeklyBackfillMonthDispatcher: enqueueWeeklyBackfillMonthDispatcher,
  processMonthlyBackfillArchiveDispatcher: enqueueMonthlyBackfillArchiveDispatcher,
} satisfies Record<ScheduleName, () => unknown>

const backfillIds = {
  processNightlyBackfillWeekDispatcher: 'sitemaps-nightly-week',
  processWeeklyBackfillMonthDispatcher: 'sitemaps-weekly-month',
  processMonthlyBackfillArchiveDispatcher: 'sitemaps-monthly-archive',
} satisfies Record<ScheduleName, string>

const descriptions = {
  processNightlyBackfillWeekDispatcher: 'Nightly sitemap backfill for the week',
  processWeeklyBackfillMonthDispatcher: 'Weekly sitemap backfill for the month',
  processMonthlyBackfillArchiveDispatcher: 'Monthly sitemap archive backfill',
} satisfies Record<ScheduleName, string>

export const scheduledJobManifest = defineScheduledJobManifest(
  BACKGROUND_QUEUE_NAME,
  BACKFILL_SCHEDULES.map(schedule => ({
    schedulerId: `sitemaps-backfill-${schedule.name}`,
    repeat: { pattern: schedule.pattern },
    template: {
      name: jobs[schedule.name].name,
      opts: toSchedulerTemplateOptions({
        ...jobs[schedule.name].options,
        ordering: SITEMAPS_ORDERING.dispatcher,
      }),
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
