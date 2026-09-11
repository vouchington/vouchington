import { recalculateUserVoteWeight } from '@services/vote-weight/update'
import { enqueueElectionUpdatesForUser } from '@services/vote-weight/enqueue-election-updates'
import { findUsersNeedingVoteWeightRecalculation } from '@services/vote-weight/find-users-needing-recalculation'
import {
  enqueueBulkRecalculateUserVoteWeight,
  enqueueRecalculateVoteWeightDispatcher,
} from '@queues/vote-weight/enqueues'
import type {
  ProcessRecalculateUserVoteWeightData,
  ProcessRecalculateVoteWeightDispatcherData,
} from '@queues/vote-weight/types'

const BATCH_SIZE = 500

export async function processRecalculateUserVoteWeight(
  data: ProcessRecalculateUserVoteWeightData,
): Promise<void> {
  const { userId, forceRecalculate } = data
  const { changed } = await recalculateUserVoteWeight(userId, { forceRecalculate })
  if (changed) {
    await enqueueElectionUpdatesForUser(userId)
  }
}

export async function processRecalculateVoteWeightDispatcher(
  data: ProcessRecalculateVoteWeightDispatcherData,
): Promise<void> {
  const { afterId } = data
  const { userIds, nextCursor } = await findUsersNeedingVoteWeightRecalculation(
    afterId ?? null,
    BATCH_SIZE,
  )
  if (userIds.length > 0) {
    await enqueueBulkRecalculateUserVoteWeight(userIds)
  }
  if (nextCursor) {
    await enqueueRecalculateVoteWeightDispatcher(nextCursor)
  }
}
