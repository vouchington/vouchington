import { boundRateLimitDeferral } from '@modules/queue-errors'
import {
  BLUESKY_FOLLOW_PROPAGATION_BACKFILL_DISCONNECTS_JOB,
  BLUESKY_FOLLOW_PROPAGATION_BACKFILL_FOLLOWS_JOB,
  BLUESKY_FOLLOW_PROPAGATION_DISCONNECT_REQUESTED_JOB,
  BLUESKY_FOLLOW_PROPAGATION_RECONCILE_FOLLOW_JOB,
} from '@queues/background/enqueues/bluesky-follow-propagation-jobs'
import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import * as processors from './processors.mts'

// The domain's group (every job shares the key `bluesky-follow-propagation` at concurrency 1) is
// what serializes Bluesky refresh-token rotation across every replica: concurrent reconcile jobs
// for different pairs sharing a follower can both trigger a refresh of that follower's Bluesky
// session, and if the authorization server rotates refresh tokens the loser's stale write can
// overwrite the winner's freshly rotated session, which an AS with refresh-token-reuse detection
// can then revoke — permanently invalidating that DID's link. See @modules/bluesky-oauth/README.md's
// "No distributed lock" section. The follower's own PDS can name a wait on every answer, so a 429
// stops requeuing for free once the job is a day old.
export const blueskyFollowPropagationHandlers = [
  backgroundHandler(BLUESKY_FOLLOW_PROPAGATION_RECONCILE_FOLLOW_JOB, job =>
    boundRateLimitDeferral(job, () => processors.reconcileFollow(job.data)),
  ),
  backgroundHandler(BLUESKY_FOLLOW_PROPAGATION_DISCONNECT_REQUESTED_JOB, job =>
    boundRateLimitDeferral(job, () => processors.disconnectRequested(job.data)),
  ),
  backgroundHandler(BLUESKY_FOLLOW_PROPAGATION_BACKFILL_FOLLOWS_JOB, job =>
    boundRateLimitDeferral(job, () => processors.backfillBlueskyFollowPropagation(job.data.after)),
  ),
  backgroundHandler(BLUESKY_FOLLOW_PROPAGATION_BACKFILL_DISCONNECTS_JOB, job =>
    boundRateLimitDeferral(job, () =>
      processors.backfillBlueskyDisconnectRequests(job.data.afterId),
    ),
  ),
]
