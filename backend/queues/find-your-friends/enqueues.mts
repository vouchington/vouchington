import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  getFindYourFriendsWorkLimit,
  FIND_YOUR_FRIENDS_DEFAULTS,
  FIND_YOUR_FRIENDS_ORDERING,
  FIND_YOUR_FRIENDS_RATE_LIMITS,
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from './config.mts'
import { findYourFriendsQueue } from './queues.mts'
import { createHash } from 'node:crypto'
import type { FriendSyncResume, FindYourFriendsJobPayloads, FindYourFriendsSyncJobs } from './types.mts'

const { attempts, backoff, removeOnComplete, removeOnFail, deduplicationTtlMs } =
  FIND_YOUR_FRIENDS_DEFAULTS

const defaults = { attempts, backoff, removeOnComplete, removeOnFail } satisfies Partial<JobOptions>
const facebookOrdering = {
  ...FIND_YOUR_FRIENDS_ORDERING.sync_facebook,
  rateLimit: FIND_YOUR_FRIENDS_RATE_LIMITS.sync_facebook,
}
const xOrdering = {
  ...FIND_YOUR_FRIENDS_ORDERING.sync_x,
  rateLimit: FIND_YOUR_FRIENDS_RATE_LIMITS.sync_x,
}
const githubOrdering = {
  ...FIND_YOUR_FRIENDS_ORDERING.sync_github,
  rateLimit: FIND_YOUR_FRIENDS_RATE_LIMITS.sync_github,
}

type SyncConfig<TJobName extends FindYourFriendsSyncJobs> = {
  jobName: TJobName
  buildData: (id: string) => FindYourFriendsJobPayloads[TJobName]
  enqueueOne: (data: FindYourFriendsJobPayloads[TJobName], options: Partial<JobOptions>) => unknown
  enqueueBulk: (ids: string[], options: Partial<JobOptions>) => unknown
  deduplicationPrefix: string
  ordering: JobOptions['ordering']
}

function buildJobOptions(
  deduplicationId: string,
  ordering: JobOptions['ordering'],
  priority: number,
): Partial<JobOptions> {
  return {
    priority,
    deduplication: {
      id: deduplicationId,
      mode: 'throttle' as const,
      ttl: deduplicationTtlMs,
    },
    ordering,
  }
}

function createFriendsEnqueueFunction<TName extends keyof FindYourFriendsJobPayloads>(
  jobName: TName,
) {
  return createEnqueueFunction<FindYourFriendsJobPayloads[TName], TName>({
    queue: findYourFriendsQueue,
    queueName: QUEUE_NAME,
    jobName,
    defaults,
  })
}

function createSyncEnqueues<TJobName extends FindYourFriendsSyncJobs>(
  config: SyncConfig<TJobName>,
) {
  return {
    one: async (id: string, priority = PRIORITY_DEFAULT): Promise<void> => {
      await config.enqueueOne(
        config.buildData(id),
        buildJobOptions(`${config.deduplicationPrefix}__${id}`, config.ordering, priority),
      )
    },
    // A continuation is a distinct job per position, so it must not share the throttled fresh-sync id.
    resume: async (id: string, resume: FriendSyncResume): Promise<void> => {
      const position = createHash('sha256').update(JSON.stringify(resume)).digest('hex')
      await config.enqueueOne(
        { ...config.buildData(id), resume },
        buildJobOptions(
          `${config.deduplicationPrefix}__${id}__resume__${position}`,
          config.ordering,
          PRIORITY_DEFAULT,
        ),
      )
    },
    bulk: async (ids: string[], priority = PRIORITY_DEFAULT): Promise<void> => {
      const ENQUEUE_BATCH_SIZE = getFindYourFriendsWorkLimit('enqueue_batch_size')
      if (ids.length === 0) return
      for (let i = 0; i < ids.length; i += ENQUEUE_BATCH_SIZE) {
        const batch = ids.slice(i, i + ENQUEUE_BATCH_SIZE)
        // oxlint-disable-next-line no-await-in-loop -- one batch must settle before the next to bound queue enqueue backpressure
        await config.enqueueBulk(batch, { priority })
      }
    },
  }
}

const FACEBOOK_JOB_NAME = 'syncFacebookFriends' satisfies FindYourFriendsSyncJobs
const X_JOB_NAME = 'syncXFriends' satisfies FindYourFriendsSyncJobs
const GITHUB_JOB_NAME = 'syncGithubFriends' satisfies FindYourFriendsSyncJobs

const facebookSync = createSyncEnqueues<typeof FACEBOOK_JOB_NAME>({
  jobName: FACEBOOK_JOB_NAME,
  buildData: facebookAccountId => ({ facebookAccountId }),
  enqueueOne: createFriendsEnqueueFunction(FACEBOOK_JOB_NAME),
  enqueueBulk: createBulkEnqueueFunction({
    queue: findYourFriendsQueue,
    queueName: QUEUE_NAME,
    jobName: FACEBOOK_JOB_NAME,
    defaults,
    buildJob: (id: string) => ({
      data: {
        facebookAccountId: id,
      } satisfies FindYourFriendsJobPayloads[typeof FACEBOOK_JOB_NAME],
      opts: buildJobOptions(`sync_facebook__${id}`, facebookOrdering, PRIORITY_DEFAULT),
    }),
  }),
  deduplicationPrefix: 'sync_facebook',
  ordering: facebookOrdering,
})

const xSync = createSyncEnqueues<typeof X_JOB_NAME>({
  jobName: X_JOB_NAME,
  buildData: xAccountId => ({ xAccountId }),
  enqueueOne: createFriendsEnqueueFunction(X_JOB_NAME),
  enqueueBulk: createBulkEnqueueFunction({
    queue: findYourFriendsQueue,
    queueName: QUEUE_NAME,
    jobName: X_JOB_NAME,
    defaults,
    buildJob: (id: string) => ({
      data: { xAccountId: id } satisfies FindYourFriendsJobPayloads[typeof X_JOB_NAME],
      opts: buildJobOptions(`sync_x__${id}`, xOrdering, PRIORITY_DEFAULT),
    }),
  }),
  deduplicationPrefix: 'sync_x',
  ordering: xOrdering,
})

const githubSync = createSyncEnqueues<typeof GITHUB_JOB_NAME>({
  jobName: GITHUB_JOB_NAME,
  buildData: githubAccountId => ({ githubAccountId }),
  enqueueOne: createFriendsEnqueueFunction(GITHUB_JOB_NAME),
  enqueueBulk: createBulkEnqueueFunction({
    queue: findYourFriendsQueue,
    queueName: QUEUE_NAME,
    jobName: GITHUB_JOB_NAME,
    defaults,
    buildJob: (id: string) => ({
      data: { githubAccountId: id } satisfies FindYourFriendsJobPayloads[typeof GITHUB_JOB_NAME],
      opts: buildJobOptions(`sync_github__${id}`, githubOrdering, PRIORITY_DEFAULT),
    }),
  }),
  deduplicationPrefix: 'sync_github',
  ordering: githubOrdering,
})

const enqueueDispatchFindYourFriendsJob = createFriendsEnqueueFunction('dispatchFindYourFriends')

export const enqueueSyncFacebookFriends = facebookSync.one
export const enqueueSyncXFriends = xSync.one
export const enqueueSyncGithubFriends = githubSync.one
export const enqueueResumeSyncFacebookFriends = facebookSync.resume
export const enqueueResumeSyncXFriends = xSync.resume
export const enqueueResumeSyncGithubFriends = githubSync.resume
export const enqueueBulkSyncFacebookFriends = facebookSync.bulk
export const enqueueBulkSyncXFriends = xSync.bulk
export const enqueueBulkSyncGithubFriends = githubSync.bulk

export function enqueueDispatchFindYourFriends(): EnqueueReturnType {
  return enqueueDispatchFindYourFriendsJob(
    {},
    {
      priority: PRIORITY_DISPATCHER,
      deduplication: { id: 'friends-dispatcher', mode: 'simple' },
    },
  )
}
