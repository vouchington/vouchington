import {
  enqueueBulkSyncFacebookFriends,
  enqueueBulkSyncXFriends,
  enqueueBulkSyncGithubFriends,
} from '@queues/find-your-friends/enqueues'
import {
  streamFacebookAccountsToSync,
  streamXAccountsToSync,
  streamGithubAccountsToSync,
  type AccountToSync,
} from '@services/friend-recommendations/accounts-to-sync'
import { ENQUEUE_BATCH_SIZE } from '@queues/find-your-friends/config'

type FindYourFriendsDependencies = {
  enqueueBulkSyncFacebookFriends: typeof enqueueBulkSyncFacebookFriends
  enqueueBulkSyncGithubFriends: typeof enqueueBulkSyncGithubFriends
  enqueueBulkSyncXFriends: typeof enqueueBulkSyncXFriends
  streamFacebookAccountsToSync: typeof streamFacebookAccountsToSync
  streamGithubAccountsToSync: typeof streamGithubAccountsToSync
  streamXAccountsToSync: typeof streamXAccountsToSync
}

export async function processFindYourFriendsDispatcher(
  dependencies?: Partial<FindYourFriendsDependencies>,
): Promise<{ count: number }> {
  const deps = {
    enqueueBulkSyncFacebookFriends,
    enqueueBulkSyncGithubFriends,
    enqueueBulkSyncXFriends,
    streamFacebookAccountsToSync,
    streamGithubAccountsToSync,
    streamXAccountsToSync,
    ...dependencies,
  }
  let count = 0

  count += await collectAndEnqueue(
    deps.streamFacebookAccountsToSync(),
    deps.enqueueBulkSyncFacebookFriends,
  )
  count += await collectAndEnqueue(deps.streamXAccountsToSync(), deps.enqueueBulkSyncXFriends)
  count += await collectAndEnqueue(
    deps.streamGithubAccountsToSync(),
    deps.enqueueBulkSyncGithubFriends,
  )

  return { count }
}

async function collectAndEnqueue(
  stream: AsyncGenerator<AccountToSync>,
  enqueueBulkFn: (ids: string[]) => Promise<void>,
): Promise<number> {
  let count = 0
  let batch: string[] = []
  for await (const row of stream) {
    batch.push(row.provider_user_id)
    if (batch.length >= ENQUEUE_BATCH_SIZE) {
      await enqueueBulkFn(batch)
      count += batch.length
      batch = []
    }
  }
  if (batch.length > 0) {
    await enqueueBulkFn(batch)
    count += batch.length
  }
  return count
}
