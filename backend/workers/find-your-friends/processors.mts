import {
  enqueueBulkSyncFacebookFriends,
  enqueueBulkSyncXFriends,
  enqueueBulkSyncGithubFriends,
} from '@queues/find-your-friends/enqueues'
import type { FriendsDispatchData } from '@queues/find-your-friends/types'
import {
  streamFacebookAccountsToSync,
  streamXAccountsToSync,
  streamGithubAccountsToSync,
  getFriendAccountSweepUpperId,
  type AccountToSync,
} from '@services/friend-recommendations/accounts-to-sync'
import { getFriendsDispatchLimits } from '@services/friend-recommendations/work-limits'

type FindYourFriendsDependencies = {
  enqueueBulkSyncFacebookFriends: typeof enqueueBulkSyncFacebookFriends
  enqueueBulkSyncGithubFriends: typeof enqueueBulkSyncGithubFriends
  enqueueBulkSyncXFriends: typeof enqueueBulkSyncXFriends
  streamFacebookAccountsToSync: typeof streamFacebookAccountsToSync
  streamGithubAccountsToSync: typeof streamGithubAccountsToSync
  streamXAccountsToSync: typeof streamXAccountsToSync
  getFriendAccountSweepUpperId: typeof getFriendAccountSweepUpperId
}

export async function processFindYourFriendsDispatcher(
  dependencies?: Partial<FindYourFriendsDependencies>,
  data: FriendsDispatchData = {},
  saveProgress?: (data: FriendsDispatchData) => Promise<void>,
): Promise<{ count: number; hasMore: boolean }> {
  const deps = {
    enqueueBulkSyncFacebookFriends,
    enqueueBulkSyncGithubFriends,
    enqueueBulkSyncXFriends,
    streamFacebookAccountsToSync,
    streamGithubAccountsToSync,
    streamXAccountsToSync,
    getFriendAccountSweepUpperId,
    ...dependencies,
  }
  const limits = getFriendsDispatchLimits()
  const sweepStartedAt = data.sweepStartedAt ?? new Date().toISOString()
  const upperIds =
    data.upperIds ??
    (Object.fromEntries(
      await Promise.all(
        (['facebook', 'x', 'github'] as const).map(async provider => [
          provider,
          await deps.getFriendAccountSweepUpperId(provider),
        ]),
      ),
    ) as Required<FriendsDispatchData>['upperIds'])
  const afterIds = { ...data.afterIds }
  const finishedProviders = [...(data.finishedProviders ?? [])]
  const providers = [
    {
      name: 'facebook',
      stream: deps.streamFacebookAccountsToSync,
      enqueue: deps.enqueueBulkSyncFacebookFriends,
    },
    { name: 'x', stream: deps.streamXAccountsToSync, enqueue: deps.enqueueBulkSyncXFriends },
    {
      name: 'github',
      stream: deps.streamGithubAccountsToSync,
      enqueue: deps.enqueueBulkSyncGithubFriends,
    },
  ] as const
  const snapshot = (): FriendsDispatchData => ({
    sweepStartedAt,
    upperIds,
    afterIds: { ...afterIds },
    finishedProviders: [...finishedProviders],
  })
  await saveProgress?.(snapshot())
  let count = 0
  for (const provider of providers) {
    if (finishedProviders.includes(provider.name)) continue
    let progress: { hasMore: boolean; lastRow?: AccountToSync } = { hasMore: false }
    const stream = provider.stream({
      sweepStartedAt,
      upperId: upperIds[provider.name],
      afterId: afterIds[provider.name],
      limits,
      onComplete: result => {
        progress = result
      },
    })
    // oxlint-disable-next-line no-await-in-loop -- each bounded provider stream preserves enqueue backpressure
    count += await collectAndEnqueue(stream, provider.enqueue, limits.batchSize, async lastId => {
      afterIds[provider.name] = lastId
      await saveProgress?.(snapshot())
    })
    if (progress.hasMore && progress.lastRow)
      afterIds[provider.name] = progress.lastRow.provider_user_id
    else finishedProviders.push(provider.name)
    // oxlint-disable-next-line no-await-in-loop -- persist completed provider state before scanning the next provider
    await saveProgress?.(snapshot())
  }
  const hasMore = finishedProviders.length < providers.length
  return { count, hasMore }
}

async function collectAndEnqueue(
  stream: AsyncGenerator<AccountToSync>,
  enqueueBulkFn: (ids: string[]) => Promise<void>,
  batchSize: number,
  saveBatch: (lastId: string) => Promise<void>,
): Promise<number> {
  let count = 0
  let batch: string[] = []
  for await (const row of stream) {
    batch.push(row.provider_user_id)
    if (batch.length >= batchSize) {
      await enqueueBulkFn(batch)
      await saveBatch(batch.at(-1)!)
      count += batch.length
      batch = []
    }
  }
  if (batch.length > 0) {
    await enqueueBulkFn(batch)
    await saveBatch(batch.at(-1)!)
    count += batch.length
  }
  return count
}
