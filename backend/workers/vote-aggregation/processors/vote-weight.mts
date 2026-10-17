import { findUsersForElectionVoteReplay } from '@services/vote-weight/relation-election-updates'
import { getVoteWeightDispatchBatchSize } from '@services/vote-weight/work-limits'
import { recalculateUserVoteWeight } from '@services/vote-weight/update'
import { enqueueElectionUpdatesForUser } from '@services/vote-weight/enqueue-election-updates'
import { dispatchVoteWeightAgeMilestones } from '@services/vote-weight/dispatch-age-milestones'
import { dispatchVoteWeightMembershipExpirations } from '@services/vote-weight/dispatch-membership-expirations'
import { dispatchVoteWeightFamilySourceChanges } from '@services/vote-weight/dispatch-family-source-changes'
import { completeVoteWeightDispatch } from '@services/vote-weight/dispatch-cursor'
import {
  enqueueBulkElectionUpdateReplay,
  enqueueRecalculateVoteWeightEvents,
  enqueueRecalculateVoteWeightDispatcher,
  enqueueVoteWeightAgeMilestones,
  enqueueVoteWeightMembershipExpirations,
  enqueueVoteWeightFamilySourceChanges,
} from '@queues/vote-aggregation/enqueues/vote-weight'
import type {
  VoteWeightAgeMilestonesData,
  VoteWeightMembershipExpirationsData,
  VoteWeightFamilySourceChangesData,
  VoteWeightDispatchPage,
} from '@queues/vote-aggregation/enqueues/types-dispatch'
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
  const { changed } = await recalculateUserVoteWeight(userId, {
    forceRecalculate,
    readFromWriter: true,
  })
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
  const { userIds, nextCursor } = await findUsersForElectionVoteReplay(afterId ?? null, BATCH_SIZE)
  if (userIds.length > 0) {
    await enqueueBulkElectionUpdateReplay(userIds)
  }
  if (nextCursor) {
    await enqueueRecalculateVoteWeightDispatcher(nextCursor, { replayElectionsOnly: true })
  }
}

export async function processVoteWeightAgeMilestones(
  data: VoteWeightAgeMilestonesData,
): Promise<void> {
  await dispatchPage(
    'age_milestones',
    await dispatchVoteWeightAgeMilestones(data),
    enqueueVoteWeightAgeMilestones,
  )
}

export async function processVoteWeightMembershipExpirations(
  data: VoteWeightMembershipExpirationsData,
): Promise<void> {
  await dispatchPage(
    'membership_expirations',
    await dispatchVoteWeightMembershipExpirations(data),
    enqueueVoteWeightMembershipExpirations,
  )
}

export async function processVoteWeightFamilySourceChanges(
  data: VoteWeightFamilySourceChangesData,
): Promise<void> {
  await dispatchPage(
    'family_source_changes',
    await dispatchVoteWeightFamilySourceChanges(data),
    enqueueVoteWeightFamilySourceChanges,
  )
}

async function dispatchPage<T>(
  dispatcher: 'age_milestones' | 'membership_expirations' | 'family_source_changes',
  page: VoteWeightDispatchPage<T>,
  enqueueContinuation: (data: T) => Promise<unknown>,
): Promise<void> {
  if (page.events.length > 0) await enqueueRecalculateVoteWeightEvents(page.events)
  if (page.hasMore) {
    if (!page.continuation)
      throw new Error(`${dispatcher} reported more work without a continuation`)
    await enqueueContinuation(page.continuation)
    return
  }
  await completeVoteWeightDispatch(dispatcher, page.window)
}
