import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  ENQUEUE_BATCH_SIZE,
  FIND_YOUR_FRIENDS_DEFAULTS,
  FIND_YOUR_FRIENDS_ORDERING,
  FIND_YOUR_FRIENDS_RATE_LIMITS,
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from './config.mts'
import { findYourFriendsQueue } from './queues.mts'
import type { FindYourFriendsDispatcherJobs, FindYourFriendsSyncJobs } from './types.mts'

const { attempts, backoff, removeOnComplete, removeOnFail, deduplicationTtlMs } =
  FIND_YOUR_FRIENDS_DEFAULTS

const defaults = { attempts, backoff, removeOnComplete, removeOnFail } satisfies Partial<JobOptions>
type DispatcherOptions = {
  deduplicationId?: string
}
const BACKFILL_DEDUPLICATION_TTL_MS = 60 * 60_000

type SyncConfig<TData> = {
  jobName: FindYourFriendsSyncJobs
  buildData: (id: string) => TData
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

function createSyncEnqueues<TData>(config: SyncConfig<TData>) {
  const enqueueOne = createEnqueueFunction<TData, FindYourFriendsSyncJobs>({
    queue: findYourFriendsQueue,
    queueName: QUEUE_NAME,
    jobName: config.jobName,
    defaults,
  })
  const enqueueBulk = createBulkEnqueueFunction<string, TData, FindYourFriendsSyncJobs>({
    queue: findYourFriendsQueue,
    queueName: QUEUE_NAME,
    jobName: config.jobName,
    defaults,
    buildJob: id => ({
      data: config.buildData(id),
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
        config.buildData(id),
        buildJobOptions(`${config.deduplicationPrefix}__${id}`, config.ordering, priority),
      )
    },
    bulk: async (ids: string[], priority = PRIORITY_DEFAULT): Promise<void> => {
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
  buildData: facebookUserId => ({ facebookUserId }),
  deduplicationPrefix: 'sync_facebook',
  ordering: {
    ...FIND_YOUR_FRIENDS_ORDERING.sync_facebook,
    rateLimit: FIND_YOUR_FRIENDS_RATE_LIMITS.sync_facebook,
  },
})

const xSync = createSyncEnqueues({
  jobName: 'syncXFriends',
  buildData: xUserId => ({ xUserId }),
  deduplicationPrefix: 'sync_x',
  ordering: {
    ...FIND_YOUR_FRIENDS_ORDERING.sync_x,
    rateLimit: FIND_YOUR_FRIENDS_RATE_LIMITS.sync_x,
  },
})

const githubSync = createSyncEnqueues({
  jobName: 'syncGithubFriends',
  buildData: githubUserId => ({ githubUserId }),
  deduplicationPrefix: 'sync_github',
  ordering: {
    ...FIND_YOUR_FRIENDS_ORDERING.sync_github,
    rateLimit: FIND_YOUR_FRIENDS_RATE_LIMITS.sync_github,
  },
})

const enqueueDispatchFindYourFriendsJob = createEnqueueFunction<
  Record<string, never>,
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

export function enqueueDispatchFindYourFriends(options?: DispatcherOptions): EnqueueReturnType {
  return enqueueDispatchFindYourFriendsJob(
    {},
    {
      priority: PRIORITY_DISPATCHER,
      ordering: FIND_YOUR_FRIENDS_ORDERING.dispatcher,
      ...(options?.deduplicationId && {
        deduplication: {
          id: options.deduplicationId,
          mode: 'throttle' as const,
          ttl: BACKFILL_DEDUPLICATION_TTL_MS,
        },
      }),
    },
  )
}
