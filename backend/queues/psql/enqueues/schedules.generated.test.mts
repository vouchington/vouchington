import { describe, it, expect } from 'vitest'
import { readEnqueuedJob } from '../../../test-helpers/queue-jobs.mts'
import {
  DATA_RETENTION_SCHEDULER_ID,
  PLATFORM_STATS_VIEW,
  REFRESH_PLATFORM_STATS_SCHEDULER_ID,
  REFRESH_REVENUE_CHANGES_SCHEDULER_ID,
  REFRESH_REVENUE_MEMBERSHIPS_SCHEDULER_ID,
  REFRESH_TRENDING_RSS_FEEDS_SCHEDULER_ID,
  REVENUE_CHANGES_VIEW,
  REVENUE_MEMBERSHIPS_VIEW,
  TRENDING_RSS_FEEDS_VIEW,
} from '../config.mts'
import { psql } from '../queues.mts'
import { scheduledJobManifest } from './schedules.mts'

describe('psql schedules', () => {
  it('serializes scheduled retention with its continuations', () => {
    const scheduledRetention = scheduledJobManifest.jobs.find(
      job => job.schedulerId === DATA_RETENTION_SCHEDULER_ID,
    )
    const options = scheduledRetention?.template.opts
    expect((typeof options === 'function' ? options() : options)?.ordering).toEqual({
      key: 'data_retention',
      concurrency: 1,
    })
  })

  it('dispatches each platform materialized view from its operator schedule', async () => {
    for (const [schedulerId, viewName] of [
      [REFRESH_PLATFORM_STATS_SCHEDULER_ID, PLATFORM_STATS_VIEW],
      [REFRESH_TRENDING_RSS_FEEDS_SCHEDULER_ID, TRENDING_RSS_FEEDS_VIEW],
      [REFRESH_REVENUE_MEMBERSHIPS_SCHEDULER_ID, REVENUE_MEMBERSHIPS_VIEW],
      [REFRESH_REVENUE_CHANGES_SCHEDULER_ID, REVENUE_CHANGES_VIEW],
    ]) {
      const entry = scheduledJobManifest.jobs.find(
        candidate => candidate.schedulerId === schedulerId,
      )
      expect(entry).toBeDefined()
      const surface = entry!.operatorSurfaces.find(candidate => candidate.kind === 'scheduled-jobs')
      if (!surface || surface.kind !== 'scheduled-jobs') {
        throw new Error(`Missing scheduled operator trigger for ${viewName}`)
      }
      const enqueued = await surface.trigger()
      const job = await readEnqueuedJob(psql, enqueued)
      expect(job).toMatchObject({
        name: 'refreshMaterializedView',
        data: { viewName },
        opts: { ordering: { key: 'mv_refresh', concurrency: 1 } },
      })
    }
  })
})
