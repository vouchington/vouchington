import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  FIND_YOUR_FRIENDS_DISPATCH_JOB,
  FIND_YOUR_FRIENDS_SYNC_FACEBOOK_JOB,
  FIND_YOUR_FRIENDS_SYNC_GITHUB_JOB,
  FIND_YOUR_FRIENDS_SYNC_X_JOB,
} from '@queues/background/enqueues/find-your-friends-jobs'
import type { BackgroundJobDefinition } from '@queues/background/types'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  getFindYourFriendsWorkLimit,
  FIND_YOUR_FRIENDS_DEDUPLICATION_TTL_MS,
  FIND_YOUR_FRIENDS_ORDERING,
  FIND_YOUR_FRIENDS_RATE_LIMITS,
} from './config.mts'

type SyncConfig<TData> = {
  job: BackgroundJobDefinition<TData>
  buildData: (id: string) => TData
  deduplicationPrefix: string
  ordering: JobOptions['ordering']
}

// Priority comes from the job definition; the lane and the dedup id are per sync.
function buildJobOptions(
  deduplicationId: string,
  ordering: JobOptions['ordering'],
): Partial<JobOptions> {
  return {
    deduplication: {
      id: deduplicationId,
      mode: 'throttle' as const,
      ttl: FIND_YOUR_FRIENDS_DEDUPLICATION_TTL_MS,
    },
    ordering,
  }
}

function createSyncEnqueues<TData>(config: SyncConfig<TData>) {
  const enqueueOne = createBackgroundEnqueue(config.job)
  const enqueueBulk = createBackgroundBulkEnqueue(config.job, (id: string) => ({
    data: config.buildData(id),
    opts: buildJobOptions(`${config.deduplicationPrefix}__${id}`, config.ordering),
  }))

  return {
    one: async (id: string): Promise<void> => {
      await enqueueOne(
        config.buildData(id),
        buildJobOptions(`${config.deduplicationPrefix}__${id}`, config.ordering),
      )
    },
    bulk: async (ids: string[]): Promise<void> => {
      const ENQUEUE_BATCH_SIZE = getFindYourFriendsWorkLimit('enqueue_batch_size')
      if (ids.length === 0) return
      for (let i = 0; i < ids.length; i += ENQUEUE_BATCH_SIZE) {
        const batch = ids.slice(i, i + ENQUEUE_BATCH_SIZE)
        // oxlint-disable-next-line no-await-in-loop -- one batch must settle before the next to bound queue enqueue backpressure
        await enqueueBulk(batch)
      }
    },
  }
}

const facebookSync = createSyncEnqueues({
  job: FIND_YOUR_FRIENDS_SYNC_FACEBOOK_JOB,
  buildData: facebookUserId => ({ facebookUserId }),
  deduplicationPrefix: 'sync_facebook',
  ordering: {
    ...FIND_YOUR_FRIENDS_ORDERING.sync_facebook,
    rateLimit: FIND_YOUR_FRIENDS_RATE_LIMITS.sync_facebook,
  },
})

const xSync = createSyncEnqueues({
  job: FIND_YOUR_FRIENDS_SYNC_X_JOB,
  buildData: xUserId => ({ xUserId }),
  deduplicationPrefix: 'sync_x',
  ordering: {
    ...FIND_YOUR_FRIENDS_ORDERING.sync_x,
    rateLimit: FIND_YOUR_FRIENDS_RATE_LIMITS.sync_x,
  },
})

const githubSync = createSyncEnqueues({
  job: FIND_YOUR_FRIENDS_SYNC_GITHUB_JOB,
  buildData: githubUserId => ({ githubUserId }),
  deduplicationPrefix: 'sync_github',
  ordering: {
    ...FIND_YOUR_FRIENDS_ORDERING.sync_github,
    rateLimit: FIND_YOUR_FRIENDS_RATE_LIMITS.sync_github,
  },
})

const enqueueDispatchFindYourFriendsJob = createBackgroundEnqueue(FIND_YOUR_FRIENDS_DISPATCH_JOB)

export const enqueueSyncFacebookFriends = facebookSync.one
export const enqueueSyncXFriends = xSync.one
export const enqueueSyncGithubFriends = githubSync.one
export const enqueueBulkSyncFacebookFriends = facebookSync.bulk
export const enqueueBulkSyncXFriends = xSync.bulk
export const enqueueBulkSyncGithubFriends = githubSync.bulk

export function enqueueDispatchFindYourFriends(): EnqueueReturnType {
  return enqueueDispatchFindYourFriendsJob(
    {},
    { deduplication: { id: 'friends-dispatcher', mode: 'simple' } },
  )
}
