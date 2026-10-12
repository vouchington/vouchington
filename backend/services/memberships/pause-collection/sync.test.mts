import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as stripeClientModule from '@modules/stripe/client'
import { memberships } from '@queues/memberships/queues'
import type { SyncMembershipPauseCollectionData } from '@queues/memberships/types'
import { getUserActivePlan } from '@services/memberships'
import {
  createTestMembership,
  createTestUser,
  deleteTestMembershipPauseCollectionWork,
  expireTestMembershipPauseCollectionLease,
  getTestMembershipRaw,
  installExpiredTestMembershipPauseCollectionLease,
  readAllQueueJobs,
  recordTestMembershipPauseCollectionWork,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { DEFAULT_STRIPE_CATALOG_CONTEXT } from '../get-catalog.mts'
import { dispatchDuePauseCollectionWork } from './dispatch.mts'
import { enqueueRecordedMembershipPauseCollection } from './enqueue-recorded.mts'
import { syncMembershipPauseCollection } from './sync.mts'

type Pause = { behavior: 'void'; resumes_at?: number | null } | null

describe('membership pause collection', () => {
  const update = vi.fn<VitestLooseMock>()
  const retrieve = vi.fn<VitestLooseMock>()
  let pause: Pause

  beforeEach(() => {
    pause = null
    update.mockReset()
    retrieve.mockReset()
    update.mockImplementation(async (_id: string, params: { pause_collection: Pause | '' }) => {
      pause = params.pause_collection === '' ? null : params.pause_collection
      return { id: _id, status: 'active', pause_collection: pause }
    })
    retrieve.mockImplementation(async (id: string) => ({
      id,
      status: 'active',
      pause_collection: pause,
    }))
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      subscriptions: { retrieve, update },
    } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sets pause collection to void when the user is suspended and ignores a repeated delivery', async () => {
    const member = await createTestUser()
    const { subscriptionId, membershipId } = await directSubscription(member.id)

    await suspendTestUser(member.id)
    await queuePause(member.id)
    const [job] = await pauseJobs(member.id)
    await syncMembershipPauseCollection(job!)
    await syncMembershipPauseCollection(job!)

    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(
      subscriptionId,
      { pause_collection: { behavior: 'void' } },
      {
        idempotencyKey: `membership-pause-collection:${member.id}:${job!.requestedAt}:${subscriptionId}:void`,
      },
    )
    await expect(getTestMembershipRaw(membershipId)).resolves.toMatchObject({
      status: 'active',
      paused_at: null,
    })
    await expect(getUserActivePlan(member.id)).resolves.toBe('plus')
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('clears pause collection when the suspension is lifted and ignores a repeated lift', async () => {
    const member = await createTestUser()
    const { subscriptionId } = await directSubscription(member.id)
    await suspendTestUser(member.id)
    await queuePause(member.id)
    const [suspended] = await pauseJobs(member.id)
    await syncMembershipPauseCollection(suspended!)

    await unsuspendTestUser(member.id)
    await queuePause(member.id)
    const lifted = (await pauseJobs(member.id)).find(
      job => job.requestedAt !== suspended!.requestedAt,
    )
    await syncMembershipPauseCollection(lifted!)
    await syncMembershipPauseCollection(lifted!)

    expect(update).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenLastCalledWith(
      subscriptionId,
      { pause_collection: '' },
      {
        idempotencyKey: `membership-pause-collection:${member.id}:${lifted!.requestedAt}:${subscriptionId}:clear`,
      },
    )
  })

  it('does not pause a granted membership', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    await createTestMembership({ user_id: member.id, plan: 'plus', granted_by_id: admin.id })
    await suspendTestUser(member.id)
    await queuePause(member.id)
    const [job] = await pauseJobs(member.id)

    await syncMembershipPauseCollection(job!)
    await syncMembershipPauseCollection(job!)

    expect(retrieve).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('clears nothing when a lifted user has no direct subscription', async () => {
    const member = await createTestUser()
    await suspendTestUser(member.id)
    await queuePause(member.id)
    const [suspended] = await pauseJobs(member.id)
    await syncMembershipPauseCollection(suspended!)
    await unsuspendTestUser(member.id)
    await queuePause(member.id)
    const lifted = (await pauseJobs(member.id)).find(
      job => job.requestedAt !== suspended!.requestedAt,
    )

    await syncMembershipPauseCollection(lifted!)

    expect(retrieve).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('does not update an already canceled Stripe subscription', async () => {
    const member = await createTestUser()
    await directSubscription(member.id)
    retrieve.mockImplementation(async (id: string) => ({
      id,
      status: 'canceled',
      pause_collection: null,
    }))
    await suspendTestUser(member.id)
    await queuePause(member.id)
    const [job] = await pauseJobs(member.id)

    await syncMembershipPauseCollection(job!)
    await syncMembershipPauseCollection(job!)

    expect(update).not.toHaveBeenCalled()
  })

  it('retries a Stripe update that was not accepted', async () => {
    const member = await createTestUser()
    await directSubscription(member.id)
    update.mockRejectedValueOnce(new Error('stripe timeout'))
    await suspendTestUser(member.id)
    await queuePause(member.id)
    const [job] = await pauseJobs(member.id)

    await expect(syncMembershipPauseCollection(job!)).rejects.toThrow('stripe timeout')
    await syncMembershipPauseCollection(job!)

    expect(update).toHaveBeenCalledTimes(2)
  })

  it('skips another update when Stripe already voided collection', async () => {
    const member = await createTestUser()
    await directSubscription(member.id)
    update.mockImplementationOnce(async (_id: string, params: { pause_collection: Pause | '' }) => {
      pause = params.pause_collection === '' ? null : params.pause_collection
      throw new Error('accepted response lost')
    })
    await suspendTestUser(member.id)
    await queuePause(member.id)
    const [job] = await pauseJobs(member.id)

    await expect(syncMembershipPauseCollection(job!)).rejects.toThrow('accepted response lost')
    await syncMembershipPauseCollection(job!)

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('reclaims an expired pause-collection lease', async () => {
    const member = await createTestUser()
    await directSubscription(member.id)
    await suspendTestUser(member.id)
    await queuePause(member.id)
    const first = (await dispatchDuePauseCollectionWork()).find(row => row.userId === member.id)
    expect(first?.userId).toBe(member.id)
    expect(update).not.toHaveBeenCalled()
    await expireTestMembershipPauseCollectionLease(member.id)

    const second = (await dispatchDuePauseCollectionWork()).find(row => row.userId === member.id)
    await syncMembershipPauseCollection({
      userId: member.id,
      requestedAt: first!.requestedAt,
      leaseToken: first!.leaseToken,
    })
    await syncMembershipPauseCollection(second!)

    expect(second?.leaseToken).not.toBe(first?.leaseToken)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('reclaims an expired lease when unleased work fills the page', async () => {
    const expired = await createTestUser()
    const queued = await createTestUser()
    await installExpiredTestMembershipPauseCollectionLease(expired.id)
    await recordTestMembershipPauseCollectionWork(queued.id)

    const claimed = await dispatchDuePauseCollectionWork(1)

    expect(claimed.map(row => row.userId)).toContain(expired.id)
    await deleteTestMembershipPauseCollectionWork(expired.id)
    await deleteTestMembershipPauseCollectionWork(queued.id)
  })

  it('treats a missing Stripe subscription as a no-op', async () => {
    const member = await createTestUser()
    await directSubscription(member.id)
    retrieve.mockRejectedValue(Object.assign(new Error('missing'), { code: 'resource_missing' }))
    await suspendTestUser(member.id)
    await queuePause(member.id)
    const [job] = await pauseJobs(member.id)

    await syncMembershipPauseCollection(job!)
    await syncMembershipPauseCollection(job!)

    expect(update).not.toHaveBeenCalled()
  })
})

async function directSubscription(userId: string): Promise<{
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

async function queuePause(userId: string): Promise<void> {
  await recordTestMembershipPauseCollectionWork(userId)
  await enqueueRecordedMembershipPauseCollection(userId)
}

async function pauseJobs(userId: string): Promise<SyncMembershipPauseCollectionData[]> {
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
