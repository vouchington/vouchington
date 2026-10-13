import { randomUUID } from 'node:crypto'
import { enqueueSyncMembershipPauseCollection } from '../queues/memberships/enqueues/pause-collection.mts'
import { memberships } from '../queues/memberships/queues.mts'
import type { SyncMembershipPauseCollectionData } from '../queues/memberships/types.mts'
import { DEFAULT_STRIPE_CATALOG_CONTEXT } from '../services/memberships/get-catalog.mts'
import { dispatchDuePauseCollectionWork } from '../services/memberships/pause-collection/dispatch.mts'
import { createTestMembership } from './entities/memberships.mts'
import {
  getTestMembershipPauseCollectionRequestedAt,
  getTestMembershipPauseCollectionWork,
  recordTestMembershipPauseCollectionWork,
} from './entities/membership-pause-collection.mts'
import { readAllQueueJobs } from './queue-jobs.mts'

/** Creates a direct Stripe membership the pause-collection worker can manage. */
export async function createTestPauseCollectionDirectSubscription(userId: string): Promise<{
  subscriptionId: string
  membershipId: string
}> {
  const subscriptionId = `sub_${randomUUID()}`
  const membership = await createTestMembership({
    user_id: userId,
    plan: 'plus',
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: `cus_${randomUUID()}`,
    provider_environment: DEFAULT_STRIPE_CATALOG_CONTEXT.environment,
    provider_application_id: DEFAULT_STRIPE_CATALOG_CONTEXT.applicationId,
  })
  return { subscriptionId, membershipId: membership.id }
}

/** Records the generation and enqueues its sync, the same way a committed suspension does. */
export async function queueTestPauseCollectionSync(userId: string): Promise<void> {
  await recordTestMembershipPauseCollectionWork(userId)
  const requestedAt = await getTestMembershipPauseCollectionRequestedAt(userId)
  if (!requestedAt) throw new Error(`No pause-collection work for ${userId}`)
  await enqueueSyncMembershipPauseCollection({
    userId,
    requestedAt: requestedAt.toISOString(),
  })
}

/**
 * Returns this user's dispatcher claim. A parallel test may claim the row first;
 * the stored lease is that claim when it is not in this page.
 */
export async function claimTestPauseCollectionDispatch(
  userId: string,
  requestedAt: string,
  previousToken?: string,
): Promise<{ userId: string; requestedAt: string; leaseToken: string }> {
  const claimed = (await dispatchDuePauseCollectionWork()).find(row => row.userId === userId)
  if (claimed && claimed.leaseToken !== previousToken) return claimed
  const held = await getTestMembershipPauseCollectionWork(userId)
  if (held?.leaseToken && held.leaseToken !== previousToken) {
    return { userId, requestedAt, leaseToken: held.leaseToken }
  }
  throw new Error(`pause-collection dispatcher did not claim ${userId}`)
}

/** Reads this user's pause-collection sync jobs from the shared queue. */
export async function readTestPauseCollectionSyncJobs(
  userId: string,
): Promise<SyncMembershipPauseCollectionData[]> {
  const jobs = await readAllQueueJobs(memberships)
  return jobs.flatMap(job => {
    const data: unknown = job.data
    if (
      job.name !== 'syncMembershipPauseCollection' ||
      typeof data !== 'object' ||
      data === null ||
      !('userId' in data) ||
      data.userId !== userId ||
      !('requestedAt' in data) ||
      typeof data.requestedAt !== 'string'
    ) {
      return []
    }
    return [
      {
        userId,
        requestedAt: data.requestedAt,
        ...('leaseToken' in data && typeof data.leaseToken === 'string'
          ? { leaseToken: data.leaseToken }
          : {}),
      },
    ]
  })
}
