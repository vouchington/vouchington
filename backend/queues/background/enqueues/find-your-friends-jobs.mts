import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// The old queue had no queue-wide cap: each provider sync ran in its own ordering lane
// (`sync_facebook`, `sync_x`, `sync_github`) with its own concurrency and rate limit, namespaced at
// enqueue time, so the group is `entity`. Baseline worker load was 5.
export const FIND_YOUR_FRIENDS_DOMAIN = defineBackgroundDomain({
  domain: 'find-your-friends',
  group: { kind: 'entity' },
  workerConcurrency: 5,
})

export type FriendsDispatchData = {
  sweepStartedAt?: string
  upperIds?: Record<'facebook' | 'x' | 'github', string | null>
  afterIds?: Partial<Record<'facebook' | 'x' | 'github', string>>
  finishedProviders?: ('facebook' | 'x' | 'github')[]
}

const DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} as const

export const FIND_YOUR_FRIENDS_ENQUEUE_DISPATCH_JOB = defineBackgroundJob<Record<string, never>>(
  FIND_YOUR_FRIENDS_DOMAIN,
  {
    name: 'enqueueDispatchFindYourFriends',
    priority: PRIORITY_DISPATCH,
    ...DEFAULTS,
  },
)
export const FIND_YOUR_FRIENDS_DISPATCH_JOB = defineBackgroundJob<FriendsDispatchData>(
  FIND_YOUR_FRIENDS_DOMAIN,
  { name: 'dispatchFindYourFriends', priority: PRIORITY_DISPATCH, ...DEFAULTS },
)
export const FIND_YOUR_FRIENDS_SYNC_FACEBOOK_JOB = defineBackgroundJob<{
  facebookUserId: string
}>(FIND_YOUR_FRIENDS_DOMAIN, { name: 'syncFacebookFriends', priority: PRIORITY_TASK, ...DEFAULTS })
export const FIND_YOUR_FRIENDS_SYNC_X_JOB = defineBackgroundJob<{ xUserId: string }>(
  FIND_YOUR_FRIENDS_DOMAIN,
  { name: 'syncXFriends', priority: PRIORITY_TASK, ...DEFAULTS },
)
export const FIND_YOUR_FRIENDS_SYNC_GITHUB_JOB = defineBackgroundJob<{ githubUserId: string }>(
  FIND_YOUR_FRIENDS_DOMAIN,
  { name: 'syncGithubFriends', priority: PRIORITY_TASK, ...DEFAULTS },
)

export const FIND_YOUR_FRIENDS_JOBS = [
  FIND_YOUR_FRIENDS_ENQUEUE_DISPATCH_JOB,
  FIND_YOUR_FRIENDS_DISPATCH_JOB,
  FIND_YOUR_FRIENDS_SYNC_FACEBOOK_JOB,
  FIND_YOUR_FRIENDS_SYNC_X_JOB,
  FIND_YOUR_FRIENDS_SYNC_GITHUB_JOB,
] as const
