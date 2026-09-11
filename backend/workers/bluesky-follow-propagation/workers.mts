import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import type { Job } from 'glide-mq'
import { QUEUE_NAME } from '@queues/bluesky-follow-propagation/config'
import type { BlueskyFollowPropagationJobs } from '@queues/bluesky-follow-propagation/types'
import * as processors from './processors.mts'

export const blueskyFollowPropagationWorker = createWorker(
  QUEUE_NAME,
  (job: Job) => {
    const fn = processors[job.name as BlueskyFollowPropagationJobs]
    if (!fn || typeof fn !== 'function') {
      throw new Error(`Bluesky follow propagation job ${job.name} not found`)
    }
    return fn(job.data as never)
  },
  {
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
  },
)
