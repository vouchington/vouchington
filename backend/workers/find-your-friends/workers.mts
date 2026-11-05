import { createWorker, processRetainedSweep } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { QUEUE_NAME } from '@queues/find-your-friends/config'
import { processFindYourFriendsDispatcher } from './processors.mts'
import { syncFacebookFriends } from '@services/oauth-facebook/friends'
import { syncXFriends } from '@services/oauth-x/friends'
import { syncGithubFriends } from '@services/oauth-github/friends'
import {
  getFriendSyncProviderUserId,
  type FriendSyncProvider,
} from '@services/friend-recommendations/accounts-to-sync'
import type { Job } from 'glide-mq'

export const findYourFriends = createWorker(
  QUEUE_NAME,
  (job: Job) => {
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
        return syncProviderFriends('facebook', facebookAccountId, syncFacebookFriends)
      }
      case 'sync_x': {
        if (job.name !== 'syncXFriends')
          throw new Error(`find-your-friends sync_x job ${job.name} not found`)
        const xAccountId = job.data?.xAccountId
        if (!xAccountId) throw new Error('syncXFriends: xAccountId is required')
        return syncProviderFriends('x', xAccountId, syncXFriends)
      }
      case 'sync_github': {
        if (job.name !== 'syncGithubFriends')
          throw new Error(`find-your-friends sync_github job ${job.name} not found`)
        const githubAccountId = job.data?.githubAccountId
        if (!githubAccountId) throw new Error('syncGithubFriends: githubAccountId is required')
        return syncProviderFriends('github', githubAccountId, syncGithubFriends)
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
  sync: (providerUserId: string) => Promise<void>,
): Promise<void> {
  const providerUserId = await getFriendSyncProviderUserId(provider, accountId)
  if (providerUserId) await sync(providerUserId)
}
