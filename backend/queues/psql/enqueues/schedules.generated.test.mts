import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readEnqueuedJob } from '../../../test-helpers/queue-jobs.mts'
import {
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
import { enqueueDataRetentionContinuation } from '../enqueues.mts'

describe('psql schedules', () => {
  it('enqueues a retryable retention continuation with a fixed-length child id', async () => {
    const data = {
      voteTables: ['post_votes'],
      userAgentStrings: false,
      voteIntegrityDetails: true,
    }
    const parentJobId = randomUUID()
    const [enqueued] = await enqueueDataRetentionContinuation(parentJobId, data)
    const job = await readEnqueuedJob(psql, enqueued)
    expect(job).toMatchObject({
      name: 'continueVoteRetentionCleanup',
      data,
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        ordering: { key: 'data_retention:cleanup', concurrency: 1 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    })
    expect(job.id).toMatch(/^vote-retention__[a-f0-9]{32}$/)

    const [changed] = await enqueueDataRetentionContinuation(parentJobId, {
      ...data,
      voteIntegrityDetails: false,
    })
    const changedJob = await readEnqueuedJob(psql, changed)
    expect(changedJob.id).toMatch(/^vote-retention__[a-f0-9]{32}$/)
    expect(changedJob.id).not.toBe(job.id)
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
