import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { removeQueuedJobsById } from '@voucha/test-helpers/shared-queue-cleanup'
import { findYourFriendsQueue } from '@queues/find-your-friends/queues'
import { FRIEND_DISPATCH_JOBS, FRIEND_DISPATCH_PROVIDERS } from '@queues/find-your-friends/config'
import { scheduledJobManifest } from '@queues/find-your-friends/enqueues/schedules'
import { BACKFILL_REGISTRY } from '@services/queue-monitoring/backfills-registry'

async function readJobsNamed(jobName: string) {
  return (await readAllQueueJobs(findYourFriendsQueue)).filter(job => job.name === jobName)
}

/** Clears the provider's queued dispatch jobs, runs one trigger, and returns what it alone enqueued. */
async function enqueuedBy(jobName: string, trigger: () => Promise<unknown>) {
  const before = await readJobsNamed(jobName)
  await removeQueuedJobsById(
    findYourFriendsQueue,
    before.map(job => job.id),
  )
  await trigger()
  return readJobsNamed(jobName)
}

function sharedLaneOpts(provider: string) {
  return {
    deduplication: { id: `friends-dispatcher:${provider}` },
    ordering: { key: 'dispatch_friends', concurrency: 1 },
  }
}

describe('find-your-friends provider dispatch jobs', () => {
  it.each(FRIEND_DISPATCH_PROVIDERS)('enqueues %s from its schedule trigger', async provider => {
    const jobName = FRIEND_DISPATCH_JOBS[provider]
    const surface = scheduledJobManifest.jobs
      .find(job => job.schedulerId === jobName)
      ?.operatorSurfaces.find(candidate => candidate.kind === 'scheduled-jobs')
    if (surface?.kind !== 'scheduled-jobs') throw new Error(`${jobName} schedule missing`)

    const jobs = await enqueuedBy(jobName, surface.trigger)
    expect(jobs.map(job => job.opts)).toMatchObject([sharedLaneOpts(provider)])
  })

  it.each(FRIEND_DISPATCH_PROVIDERS)('enqueues %s from its backfill trigger', async provider => {
    const jobName = FRIEND_DISPATCH_JOBS[provider]
    const entry = BACKFILL_REGISTRY.find(
      candidate => candidate.id === `find-your-friends-dispatch-${provider}`,
    )
    if (!entry) throw new Error(`${provider} backfill missing`)

    const jobs = await enqueuedBy(jobName, entry.trigger)
    expect(jobs.map(job => job.opts)).toMatchObject([sharedLaneOpts(provider)])
  })
})
