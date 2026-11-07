import {
  createWorker,
  processRetainedSweep,
  type NamedQueueJob,
} from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { QUEUE_NAME } from '@queues/find-your-friends/config'
import {
  enqueueResumeSyncFacebookFriends,
  enqueueResumeSyncGithubFriends,
  enqueueResumeSyncXFriends,
} from '@queues/find-your-friends/enqueues'
import type { FriendSyncResume, FindYourFriendsJobPayloads } from '@queues/find-your-friends/types'
import { processFindYourFriendsDispatcher } from './processors.mts'
import { syncFacebookFriends } from '@services/oauth-facebook/friends'
import { syncXFriends } from '@services/oauth-x/friends'
import { syncGithubFriends } from '@services/oauth-github/friends'
import {
  getFriendSyncProviderUserId,
  type FriendSyncProvider,
} from '@services/friend-recommendations/accounts-to-sync'

type FindYourFriendsJob = NamedQueueJob<FindYourFriendsJobPayloads>

export const findYourFriends = createWorker<unknown, unknown, FindYourFriendsJob>(
  QUEUE_NAME,
  (job: FindYourFriendsJob) => {
    if (job.name === 'dispatchFindYourFriends')
      return processRetainedSweep(job, save => processFindYourFriendsDispatcher(job.data, save))
    const orderingKey = job.opts.ordering?.key

    switch (orderingKey) {
      case 'sync_facebook': {
        if (job.name !== 'syncFacebookFriends')
          throw new Error(`find-your-friends sync_facebook job ${job.name} not found`)
        const facebookAccountId = job.data?.facebookAccountId
        if (!facebookAccountId)
          throw new Error('syncFacebookFriends: facebookAccountId is required')
        return syncProviderFriends(
          'facebook',
          facebookAccountId,
          job.data.resume,
          syncFacebookFriends,
          enqueueResumeSyncFacebookFriends,
        )
      }
      case 'sync_x': {
        if (job.name !== 'syncXFriends')
          throw new Error(`find-your-friends sync_x job ${job.name} not found`)
        const xAccountId = job.data?.xAccountId
        if (!xAccountId) throw new Error('syncXFriends: xAccountId is required')
        return syncProviderFriends(
          'x',
          xAccountId,
          job.data.resume,
          syncXFriends,
          enqueueResumeSyncXFriends,
        )
      }
      case 'sync_github': {
        if (job.name !== 'syncGithubFriends')
          throw new Error(`find-your-friends sync_github job ${job.name} not found`)
        const githubAccountId = job.data?.githubAccountId
        if (!githubAccountId) throw new Error('syncGithubFriends: githubAccountId is required')
        return syncProviderFriends(
          'github',
          githubAccountId,
          job.data.resume,
          syncGithubFriends,
          enqueueResumeSyncGithubFriends,
        )
      }
      case undefined:
        break
    }
    throw new Error(`Unknown ordering key: ${orderingKey}`)
  },
  {
    dedicatedCommandClient: true,
    concurrency: getWorkerConcurrency('findYourFriends', { baseline: 5 }),
  },
)

async function syncProviderFriends(
  provider: FriendSyncProvider,
  accountId: string,
  resume: FriendSyncResume | undefined,
  sync: (providerUserId: string, resume?: FriendSyncResume) => Promise<FriendSyncResume | null>,
  enqueueResume: (accountId: string, resume: FriendSyncResume) => Promise<void>,
): Promise<void> {
  const providerUserId = await getFriendSyncProviderUserId(provider, accountId)
  if (!providerUserId) return
  const continuation = await sync(providerUserId, resume)
  if (continuation) await enqueueResume(accountId, continuation)
}
