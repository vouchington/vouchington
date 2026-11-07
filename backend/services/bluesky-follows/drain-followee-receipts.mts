import { enqueueDrainFolloweeReceipts } from '@queues/bluesky-follow-propagation/enqueues'
import {
  deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage,
  START_OF_IDS,
} from './receipts.mts'

// Deletes one page of receipts where other users follow `userId`, then hands the remainder to the
// drain job instead of looping. The lock is never held across pages.
export async function drainBlueskyFolloweeReceiptsPage(
  userId: string,
  after: string = START_OF_IDS,
): Promise<void> {
  const page = await deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage(userId, after)
  if (page.hasMore) await enqueueDrainFolloweeReceipts({ userId, after: page.lastFollowerUserId! })
}
