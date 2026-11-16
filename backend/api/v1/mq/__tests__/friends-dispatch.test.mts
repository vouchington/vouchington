import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { findYourFriendsQueue } from '@queues/find-your-friends/queues'
import { FRIEND_DISPATCH_JOBS, FRIEND_DISPATCH_PROVIDERS } from '@queues/find-your-friends/config'
import { scheduledJobManifest } from '@queues/find-your-friends/enqueues/schedules'
import { BACKFILL_REGISTRY } from '@services/queue-monitoring/backfills-registry'

describe('find-your-friends provider dispatch jobs', () => {
  it.each(FRIEND_DISPATCH_PROVIDERS)(
    'enqueues %s in the shared dispatch lane from its schedule and backfill',
    async provider => {
      const jobName = FRIEND_DISPATCH_JOBS[provider]
      const scheduled = scheduledJobManifest.jobs.find(job => job.schedulerId === jobName)
      const surface = scheduled?.operatorSurfaces.find(
        candidate => candidate.kind === 'scheduled-jobs',
      )
      if (surface?.kind !== 'scheduled-jobs') throw new Error(`${jobName} schedule missing`)
      await surface.trigger()
      await BACKFILL_REGISTRY.find(
        entry => entry.id === `find-your-friends-dispatch-${provider}`,
      )?.trigger()

      const job = (await readAllQueueJobs(findYourFriendsQueue)).find(
        candidate => candidate.name === jobName,
      )
      expect(job?.opts).toMatchObject({
        deduplication: { id: `friends-dispatcher:${provider}` },
        ordering: { key: 'dispatch_friends', concurrency: 1 },
      })
    },
  )
})
