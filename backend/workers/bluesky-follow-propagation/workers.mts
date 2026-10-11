import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { boundRateLimitDeferral } from '@modules/queue-errors'
import type { Job, Queue, Worker } from 'glide-mq'
import { blueskyFollowPropagation } from '@queues/bluesky-follow-propagation/queues'
import type { BlueskyFollowPropagationJobs } from '@queues/bluesky-follow-propagation/types'
import * as processors from './processors.mts'

export async function processBlueskyFollowPropagationJob(job: Job): Promise<unknown> {
  const fn = processors[job.name as BlueskyFollowPropagationJobs]
  if (!fn || typeof fn !== 'function') {
    throw new Error(`Bluesky follow propagation job ${job.name} not found`)
  }
  // The follower's own PDS can name a wait on every answer, so a 429 stops requeuing for free once
  // the job is a day old.
  return boundRateLimitDeferral(job, async () => fn(job.data as never))
}

export async function createBlueskyFollowPropagationWorker(
  queue: Queue = blueskyFollowPropagation,
): Promise<Worker> {
  // Worker concurrency only bounds one process, so replicas would still run jobs in parallel.
  // The queue-wide cap is what serializes Bluesky refresh-token rotation across every replica.
  await queue.setGlobalConcurrency(1)
  return createWorker(queue.name, processBlueskyFollowPropagationJob, {
    // baseline: 1, ignoreScale: true — every Bluesky-token-touching queue job must run at worker
    // concurrency 1. This is not a throughput knob: concurrent reconcile jobs for different pairs
    // sharing a follower can both trigger a refresh of that follower's Bluesky session, and if the
    // authorization server rotates refresh tokens (standard OAuth behavior) the loser's
    // stale-refresh-token-derived write can overwrite the winner's freshly rotated session, which
    // an AS with refresh-token-reuse detection can then revoke — permanently invalidating that
    // DID's link. See @modules/bluesky-oauth/README.md's "No distributed lock" section.
    concurrency: getWorkerConcurrency('blueskyFollowPropagation', {
      baseline: 1,
      ignoreScale: true,
    }),
  })
}
