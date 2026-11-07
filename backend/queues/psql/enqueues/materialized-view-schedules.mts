import type { JobOptions } from 'glide-mq'
import {
  REFRESH_MATERIALIZED_VIEW_JOB_NAME,
  REFRESH_PLATFORM_STATS_SCHEDULER_ID,
  REFRESH_PLATFORM_STATS_CRON,
  REFRESH_TRENDING_RSS_FEEDS_SCHEDULER_ID,
  REFRESH_TRENDING_RSS_FEEDS_CRON,
  REFRESH_REVENUE_MEMBERSHIPS_SCHEDULER_ID,
  REFRESH_REVENUE_MEMBERSHIPS_CRON,
  REFRESH_REVENUE_CHANGES_SCHEDULER_ID,
  REFRESH_REVENUE_CHANGES_CRON,
  PLATFORM_STATS_VIEW,
  TRENDING_RSS_FEEDS_VIEW,
  REVENUE_MEMBERSHIPS_VIEW,
  REVENUE_CHANGES_VIEW,
} from '../config.mts'
import type { PsqlJobPayloads } from '../types.mts'
import { enqueueRefreshMaterializedView } from '../enqueues.mts'

export function materializedViewSchedules(options: JobOptions) {
  return (
    [
      [REFRESH_PLATFORM_STATS_SCHEDULER_ID, REFRESH_PLATFORM_STATS_CRON, PLATFORM_STATS_VIEW],
      [
        REFRESH_TRENDING_RSS_FEEDS_SCHEDULER_ID,
        REFRESH_TRENDING_RSS_FEEDS_CRON,
        TRENDING_RSS_FEEDS_VIEW,
      ],
      [
        REFRESH_REVENUE_MEMBERSHIPS_SCHEDULER_ID,
        REFRESH_REVENUE_MEMBERSHIPS_CRON,
        REVENUE_MEMBERSHIPS_VIEW,
      ],
      [REFRESH_REVENUE_CHANGES_SCHEDULER_ID, REFRESH_REVENUE_CHANGES_CRON, REVENUE_CHANGES_VIEW],
    ] as const
  ).map(([schedulerId, pattern, viewName]) => ({
    schedulerId,
    repeat: { pattern },
    template: {
      name: REFRESH_MATERIALIZED_VIEW_JOB_NAME,
      data: { viewName } satisfies PsqlJobPayloads[typeof REFRESH_MATERIALIZED_VIEW_JOB_NAME],
      opts: options,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs' as const,
        id: schedulerId,
        schedule: pattern,
        description: `Refresh ${viewName} materialized view (every five minutes)`,
        trigger: () => enqueueRefreshMaterializedView(viewName),
      },
    ] as const,
  }))
}
