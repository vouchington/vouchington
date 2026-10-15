import { processRetainedSweep } from '@data-stores/valkey-glide-mq'
import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  FIND_YOUR_FRIENDS_DISPATCH_JOB,
  FIND_YOUR_FRIENDS_ENQUEUE_DISPATCH_JOB,
  FIND_YOUR_FRIENDS_SYNC_FACEBOOK_JOB,
  FIND_YOUR_FRIENDS_SYNC_GITHUB_JOB,
  FIND_YOUR_FRIENDS_SYNC_X_JOB,
} from '@queues/background/enqueues/find-your-friends-jobs'
import { enqueueDispatchFindYourFriends } from '@queues/find-your-friends/enqueues'
import { FIND_YOUR_FRIENDS_ORDERING } from '@queues/find-your-friends/config'
import { syncFacebookFriends } from '@services/oauth-facebook/friends'
import { syncGithubFriends } from '@services/oauth-github/friends'
import { syncXFriends } from '@services/oauth-x/friends'
import type { Job } from 'glide-mq'
import { processFindYourFriendsDispatcher } from './processors.mts'

type Lane = keyof typeof FIND_YOUR_FRIENDS_ORDERING

/**
 * A sync job runs only in the ordering lane it was enqueued with, because the lane carries that
 * provider's concurrency and rate limit; a sync job without its lane would run unthrottled.
 */
function runInLane<T>(job: Job, lane: Lane, run: () => T): T {
  const orderingKey = job.opts.ordering?.key
  if (orderingKey !== FIND_YOUR_FRIENDS_ORDERING[lane].key) {
    throw new Error(`Unknown ordering key: ${orderingKey}`)
  }
  return run()
}

export const findYourFriendsHandlers = [
  backgroundHandler(
    FIND_YOUR_FRIENDS_ENQUEUE_DISPATCH_JOB,
    // oxlint-disable-next-line no-mistakes/async-call-disposition -- glide-mq awaits the value this handler returns.
    () => enqueueDispatchFindYourFriends(),
  ),
  backgroundHandler(FIND_YOUR_FRIENDS_DISPATCH_JOB, job =>
    processRetainedSweep(job, save => processFindYourFriendsDispatcher(undefined, job.data, save)),
  ),
  backgroundHandler(FIND_YOUR_FRIENDS_SYNC_FACEBOOK_JOB, job =>
    runInLane(job, 'sync_facebook', () => {
      const facebookUserId = job.data?.facebookUserId
      if (!facebookUserId) throw new Error('syncFacebookFriends: facebookUserId is required')
      return syncFacebookFriends(facebookUserId)
    }),
  ),
  backgroundHandler(FIND_YOUR_FRIENDS_SYNC_X_JOB, job =>
    runInLane(job, 'sync_x', () => {
      const xUserId = job.data?.xUserId
      if (!xUserId) throw new Error('syncXFriends: xUserId is required')
      return syncXFriends(xUserId)
    }),
  ),
  backgroundHandler(FIND_YOUR_FRIENDS_SYNC_GITHUB_JOB, job =>
    runInLane(job, 'sync_github', () => {
      const githubUserId = job.data?.githubUserId
      if (!githubUserId) throw new Error('syncGithubFriends: githubUserId is required')
      return syncGithubFriends(githubUserId)
    }),
  ),
]
