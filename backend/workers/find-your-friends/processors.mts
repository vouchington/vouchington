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
  type FriendSyncProvider,
} from '@services/friend-recommendations/accounts-to-sync'
import { getFriendsDispatchLimits } from '@services/friend-recommendations/work-limits'

const providers = {
  facebook: { stream: streamFacebookAccountsToSync, enqueue: enqueueBulkSyncFacebookFriends },
  x: { stream: streamXAccountsToSync, enqueue: enqueueBulkSyncXFriends },
  github: { stream: streamGithubAccountsToSync, enqueue: enqueueBulkSyncGithubFriends },
} as const satisfies Record<FriendSyncProvider, unknown>

/**
 * Walks one provider's capped account pages and enqueues its eligible sync jobs. Each provider is
 * its own job with its own cursor, caps, retry and failure; nothing is shared between providers.
 */
export async function processFriendsProviderDispatch(
  provider: FriendSyncProvider,
  data: FriendsDispatchData = {},
  saveProgress?: (data: FriendsDispatchData) => Promise<void>,
): Promise<{ count: number; hasMore: boolean }> {
  const limits = getFriendsDispatchLimits(provider)
  const sweepStartedAt = data.sweepStartedAt ?? new Date().toISOString()
  const upperId =
    data.upperId !== undefined ? data.upperId : await getFriendAccountSweepUpperId(provider)
  await saveProgress?.({ sweepStartedAt, upperId, afterId: data.afterId })
  let progress: { hasMore: boolean; lastRow?: AccountToSync } = { hasMore: false }
  const stream = providers[provider].stream({
    sweepStartedAt,
    upperId,
    afterId: data.afterId,
    limits,
    onComplete: result => {
      progress = result
    },
  })
  const count = await collectAndEnqueue(
    stream,
    providers[provider].enqueue,
    limits.batchSize,
    async lastId => saveProgress?.({ sweepStartedAt, upperId, afterId: lastId }),
  )
  if (!progress.hasMore || !progress.lastRow) return { count, hasMore: false }
  await saveProgress?.({ sweepStartedAt, upperId, afterId: progress.lastRow.id })
  return { count, hasMore: true }
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
    if (!row.eligible) continue
    batch.push(row.id)
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
