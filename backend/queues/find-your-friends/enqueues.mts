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
import type {
  FriendsDispatchData,
  FindYourFriendsDispatcherJobs,
  FindYourFriendsSyncJobs,
} from './types.mts'

const { attempts, backoff, removeOnComplete, removeOnFail, deduplicationTtlMs } =
  FIND_YOUR_FRIENDS_DEFAULTS

const defaults = { attempts, backoff, removeOnComplete, removeOnFail } satisfies Partial<JobOptions>

type SyncConfig = {
  deduplicationPrefix: string
  ordering: JobOptions['ordering']
} & (
  | { jobName: 'syncFacebookFriends'; idField: 'facebookAccountId' }
  | { jobName: 'syncXFriends'; idField: 'xAccountId' }
  | { jobName: 'syncGithubFriends'; idField: 'githubAccountId' }
)

function buildSyncData(field: SyncConfig['idField'], id: string) {
  switch (field) {
    case 'facebookAccountId':
      return { facebookAccountId: id }
    case 'xAccountId':
      return { xAccountId: id }
    case 'githubAccountId':
      return { githubAccountId: id }
  }
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

function createSyncEnqueues(config: SyncConfig) {
  const enqueueOne = createEnqueueFunction<
    ReturnType<typeof buildSyncData>,
    FindYourFriendsSyncJobs
  >({
    queue: findYourFriendsQueue,
    queueName: QUEUE_NAME,
    jobName: config.jobName,
    defaults,
  })
  const enqueueBulk = createBulkEnqueueFunction({
    queue: findYourFriendsQueue,
    queueName: QUEUE_NAME,
    jobName: config.jobName,
    defaults,
    buildJob: (id: string) => ({
      data: buildSyncData(config.idField, id),
      opts: buildJobOptions(
        `${config.deduplicationPrefix}__${id}`,
        config.ordering,
        PRIORITY_DEFAULT,
      ),
    }),
  })

  return {
    one: async (id: string, priority = PRIORITY_DEFAULT): Promise<void> => {
      await enqueueOne(
        buildSyncData(config.idField, id),
        buildJobOptions(`${config.deduplicationPrefix}__${id}`, config.ordering, priority),
      )
    },
    bulk: async (ids: string[], priority = PRIORITY_DEFAULT): Promise<void> => {
      const ENQUEUE_BATCH_SIZE = getFindYourFriendsWorkLimit('enqueue_batch_size')
      if (ids.length === 0) return
      for (let i = 0; i < ids.length; i += ENQUEUE_BATCH_SIZE) {
        const batch = ids.slice(i, i + ENQUEUE_BATCH_SIZE)
        // oxlint-disable-next-line no-await-in-loop -- one batch must settle before the next to bound queue enqueue backpressure
        await enqueueBulk(batch, { priority })
      }
    },
  }
}

const facebookSync = createSyncEnqueues({
  jobName: 'syncFacebookFriends',
  idField: 'facebookAccountId',
  deduplicationPrefix: 'sync_facebook',
  ordering: {
    ...FIND_YOUR_FRIENDS_ORDERING.sync_facebook,
    rateLimit: FIND_YOUR_FRIENDS_RATE_LIMITS.sync_facebook,
  },
})

const xSync = createSyncEnqueues({
  jobName: 'syncXFriends',
  idField: 'xAccountId',
  deduplicationPrefix: 'sync_x',
  ordering: {
    ...FIND_YOUR_FRIENDS_ORDERING.sync_x,
    rateLimit: FIND_YOUR_FRIENDS_RATE_LIMITS.sync_x,
  },
})

const githubSync = createSyncEnqueues({
  jobName: 'syncGithubFriends',
  idField: 'githubAccountId',
  deduplicationPrefix: 'sync_github',
  ordering: {
    ...FIND_YOUR_FRIENDS_ORDERING.sync_github,
    rateLimit: FIND_YOUR_FRIENDS_RATE_LIMITS.sync_github,
  },
})

const enqueueDispatchFindYourFriendsJob = createEnqueueFunction<
  FriendsDispatchData,
  FindYourFriendsDispatcherJobs
>({
  queue: findYourFriendsQueue,
  queueName: QUEUE_NAME,
  jobName: 'dispatchFindYourFriends',
  defaults,
})

export const enqueueSyncFacebookFriends = facebookSync.one
export const enqueueSyncXFriends = xSync.one
export const enqueueSyncGithubFriends = githubSync.one
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
