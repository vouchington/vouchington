import { findUsersForElectionVoteReplay } from '@services/vote-weight/relation-election-updates'
import { getVoteWeightDispatchBatchSize } from '@services/vote-weight/work-limits'
import { recalculateUserVoteWeight } from '@services/vote-weight/update'
import { enqueueElectionUpdatesForUser } from '@services/vote-weight/enqueue-election-updates'
import { findUsersNeedingVoteWeightRecalculation } from '@services/vote-weight/find-users-needing-recalculation'
import {
  enqueueBulkRecalculateUserVoteWeight,
  enqueueBulkElectionUpdateReplay,
  enqueueRecalculateVoteWeightDispatcher,
} from '@queues/vote-aggregation/enqueues/vote-weight'
import type {
  ProcessRecalculateUserVoteWeightData,
  ProcessRecalculateVoteWeightDispatcherData,
} from '@queues/vote-aggregation/enqueues/types-vote-weight'

export async function processRecalculateUserVoteWeight(
  data: ProcessRecalculateUserVoteWeightData,
): Promise<void> {
  const { userId, forceRecalculate } = data
  if (data.replayElectionsOnly) {
    await enqueueElectionUpdatesForUser(userId)
    return
  }
  const { changed } = await recalculateUserVoteWeight(userId, { forceRecalculate })
  // The first page of the user's votes runs here; a longer history continues in fan-out jobs.
  if (changed) {
    await enqueueElectionUpdatesForUser(userId)
  }
}

export async function processRecalculateVoteWeightDispatcher(
  data: ProcessRecalculateVoteWeightDispatcherData,
): Promise<void> {
  const BATCH_SIZE = getVoteWeightDispatchBatchSize()
  const { afterId } = data
  const { userIds, nextCursor } = await (data.replayElectionsOnly
    ? findUsersForElectionVoteReplay(afterId ?? null, BATCH_SIZE)
    : findUsersNeedingVoteWeightRecalculation(afterId ?? null, BATCH_SIZE))
  if (userIds.length > 0) {
    if (data.replayElectionsOnly) await enqueueBulkElectionUpdateReplay(userIds)
    else await enqueueBulkRecalculateUserVoteWeight(userIds)
  }
  if (nextCursor) {
    await enqueueRecalculateVoteWeightDispatcher(nextCursor, {
      replayElectionsOnly: data.replayElectionsOnly,
    })
  }
}
