import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as stripeClientModule from '@modules/stripe/client'
import { getUserActivePlan } from '@services/memberships'
import {
  backdateTestMembershipPauseCollectionAvailableAt,
  claimTestPauseCollectionDispatch,
  commitTestPauseCollectionGeneration,
  createTestPauseCollectionDirectSubscription,
  createTestUser,
  deleteTestMembershipPauseCollectionWork,
  expireTestMembershipPauseCollectionLease,
  getTestMembershipPauseCollectionWork,
  getTestMembershipRaw,
  queueTestPauseCollectionSync,
  readTestPauseCollectionSyncJobs,
  recordTestMembershipPauseCollectionWork,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { dispatchDuePauseCollectionWork } from './dispatch.mts'
import { membershipPauseCollectionRetryDelayMs } from './retry-delay.mts'
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
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sets pause collection to void when the user is suspended and ignores a repeated delivery', async () => {
    const member = await createTestUser()
    const { subscriptionId, membershipId } = await createTestPauseCollectionDirectSubscription(
      member.id,
    )

    await suspendTestUser(member.id)
    await queueTestPauseCollectionSync(member.id)
    const [job] = await readTestPauseCollectionSyncJobs(member.id)
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
    const { subscriptionId } = await createTestPauseCollectionDirectSubscription(member.id)
    await suspendTestUser(member.id)
    await queueTestPauseCollectionSync(member.id)
    const [suspended] = await readTestPauseCollectionSyncJobs(member.id)
    await syncMembershipPauseCollection(suspended!)

    await unsuspendTestUser(member.id)
    await queueTestPauseCollectionSync(member.id)
    const lifted = (await readTestPauseCollectionSyncJobs(member.id)).find(
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

  it('retries a Stripe update that was not accepted', async () => {
    const member = await createTestUser()
    await createTestPauseCollectionDirectSubscription(member.id)
    update.mockRejectedValueOnce(new Error('stripe timeout'))
    await suspendTestUser(member.id)
    await queueTestPauseCollectionSync(member.id)
    const [job] = await readTestPauseCollectionSyncJobs(member.id)

    await expect(syncMembershipPauseCollection(job!)).rejects.toThrow('stripe timeout')
    const failed = await getTestMembershipPauseCollectionWork(member.id)
    expect(failed?.leaseToken).toBeNull()
    expect(failed!.availableAt.getTime()).toBeGreaterThan(Date.now())
    await syncMembershipPauseCollection(job!)
    expect(update).toHaveBeenCalledTimes(1)
    await backdateTestMembershipPauseCollectionAvailableAt(member.id)
    await syncMembershipPauseCollection(job!)

    expect(update).toHaveBeenCalledTimes(2)
  })

  it('skips another update when Stripe already voided collection', async () => {
    const member = await createTestUser()
    await createTestPauseCollectionDirectSubscription(member.id)
    update.mockImplementationOnce(async (_id: string, params: { pause_collection: Pause | '' }) => {
      pause = params.pause_collection === '' ? null : params.pause_collection
      throw new Error('accepted response lost')
    })
    await suspendTestUser(member.id)
    await queueTestPauseCollectionSync(member.id)
    const [job] = await readTestPauseCollectionSyncJobs(member.id)

    await expect(syncMembershipPauseCollection(job!)).rejects.toThrow('accepted response lost')
    await backdateTestMembershipPauseCollectionAvailableAt(member.id)
    await syncMembershipPauseCollection(job!)

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('reclaims an expired pause-collection lease', async () => {
    const member = await createTestUser()
    await createTestPauseCollectionDirectSubscription(member.id)
    await suspendTestUser(member.id)
    await queueTestPauseCollectionSync(member.id)
    const [job] = await readTestPauseCollectionSyncJobs(member.id)
    const first = await claimTestPauseCollectionDispatch(member.id, job!.requestedAt)
    expect(update).not.toHaveBeenCalled()
    await expireTestMembershipPauseCollectionLease(member.id)
    const second = await claimTestPauseCollectionDispatch(
      member.id,
      job!.requestedAt,
      first.leaseToken,
    )
    await syncMembershipPauseCollection({
      userId: member.id,
      requestedAt: first.requestedAt,
      leaseToken: first.leaseToken,
    })
    await syncMembershipPauseCollection(second)

    expect(second.leaseToken).not.toBe(first.leaseToken)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('does not reacquire a released lease before available_at', async () => {
    const member = await createTestUser()
    await createTestPauseCollectionDirectSubscription(member.id)
    update.mockRejectedValueOnce(new Error('stripe timeout'))
    await suspendTestUser(member.id)
    await queueTestPauseCollectionSync(member.id)
    const [job] = await readTestPauseCollectionSyncJobs(member.id)
    const stale = { ...job!, leaseToken: randomUUID() }

    await expect(syncMembershipPauseCollection(stale)).rejects.toThrow('stripe timeout')
    await syncMembershipPauseCollection(stale)

    expect(update).toHaveBeenCalledTimes(1)
    await deleteTestMembershipPauseCollectionWork(member.id)
  })

  it('treats a missing Stripe subscription as a no-op', async () => {
    const member = await createTestUser()
    await createTestPauseCollectionDirectSubscription(member.id)
    retrieve.mockRejectedValue(Object.assign(new Error('missing'), { code: 'resource_missing' }))
    await suspendTestUser(member.id)
    await queueTestPauseCollectionSync(member.id)
    const [job] = await readTestPauseCollectionSyncJobs(member.id)

    await syncMembershipPauseCollection(job!)
    await syncMembershipPauseCollection(job!)

    expect(update).not.toHaveBeenCalled()
  })

  it('backs off a failed Stripe update until available_at', async () => {
    const member = await createTestUser()
    const sibling = await createTestUser()
    await createTestPauseCollectionDirectSubscription(member.id)
    update.mockRejectedValueOnce(
      Object.assign(new Error('stripe timeout'), { code: 'api_connection_error' }),
    )
    await suspendTestUser(member.id)
    await queueTestPauseCollectionSync(member.id)
    await recordTestMembershipPauseCollectionWork(sibling.id)
    await backdateTestMembershipPauseCollectionAvailableAt(sibling.id)
    const [job] = await readTestPauseCollectionSyncJobs(member.id)
    const started = Date.now()

    await expect(syncMembershipPauseCollection(job!)).rejects.toThrow('stripe timeout')

    const failed = await getTestMembershipPauseCollectionWork(member.id)
    const delay = membershipPauseCollectionRetryDelayMs(1)
    expect(failed).toMatchObject({
      leaseToken: null,
      attemptCount: 1,
      lastFailureMessage: 'stripe timeout',
    })
    expect(failed!.lastFailedAt).toBeInstanceOf(Date)
    expect(failed!.availableAt.getTime()).toBeGreaterThan(started + delay - 1000)
    expect(failed!.availableAt.getTime()).toBeLessThan(Date.now() + delay + 1000)
    expect(console.error).toHaveBeenCalledWith('Stripe pause collection update failed', {
      userId: member.id,
      requestedAt: job!.requestedAt,
      attemptCount: 1,
      stripeErrorCode: 'api_connection_error',
    })
    const claimedIds = (await dispatchDuePauseCollectionWork(2)).map(row => row.userId)
    expect(claimedIds).not.toContain(member.id)
    const siblingHeld = await getTestMembershipPauseCollectionWork(sibling.id)
    expect(claimedIds.includes(sibling.id) || siblingHeld?.leaseToken != null).toBe(true)
    expect(await getTestMembershipPauseCollectionWork(member.id)).toMatchObject({
      availableAt: failed!.availableAt,
      attemptCount: 1,
      leaseToken: null,
    })
    await deleteTestMembershipPauseCollectionWork(member.id)
    await deleteTestMembershipPauseCollectionWork(sibling.id)
  })

  it('deletes the row when a later retry succeeds', async () => {
    const member = await createTestUser()
    await createTestPauseCollectionDirectSubscription(member.id)
    update.mockRejectedValueOnce(new Error('stripe timeout'))
    await suspendTestUser(member.id)
    await queueTestPauseCollectionSync(member.id)
    const [job] = await readTestPauseCollectionSyncJobs(member.id)

    await expect(syncMembershipPauseCollection(job!)).rejects.toThrow('stripe timeout')
    await backdateTestMembershipPauseCollectionAvailableAt(member.id)
    await syncMembershipPauseCollection(job!)

    expect(update).toHaveBeenCalledTimes(2)
    await expect(getTestMembershipPauseCollectionWork(member.id)).resolves.toBeNull()
  })

  it('resets pause-collection backoff on a newer suspension or lift', async () => {
    const member = await createTestUser()
    await createTestPauseCollectionDirectSubscription(member.id)
    update.mockRejectedValueOnce(new Error('stripe timeout'))
    await suspendTestUser(member.id)
    await queueTestPauseCollectionSync(member.id)
    const [job] = await readTestPauseCollectionSyncJobs(member.id)
    await expect(syncMembershipPauseCollection(job!)).rejects.toThrow('stripe timeout')
    const failed = await getTestMembershipPauseCollectionWork(member.id)

    await commitTestPauseCollectionGeneration(member.id)

    const reset = await getTestMembershipPauseCollectionWork(member.id)
    expect(reset).toMatchObject({
      attemptCount: 0,
      leaseToken: null,
      lastFailedAt: null,
      lastFailureMessage: null,
    })
    expect(reset!.availableAt.getTime()).toBeLessThan(failed!.availableAt.getTime())
    await deleteTestMembershipPauseCollectionWork(member.id)
  })
})

describe('membershipPauseCollectionRetryDelayMs', () => {
  it('grows and caps at 24 hours', () => {
    const fiveMinutes = 5 * 60 * 1000
    const day = 24 * 60 * 60 * 1000
    expect(membershipPauseCollectionRetryDelayMs(1)).toBe(fiveMinutes)
    expect(membershipPauseCollectionRetryDelayMs(2)).toBe(fiveMinutes * 2)
    expect(membershipPauseCollectionRetryDelayMs(3)).toBe(fiveMinutes * 4)
    const capped = membershipPauseCollectionRetryDelayMs(9)
    expect(capped).toBe(Math.min(fiveMinutes * 2 ** 8, day))
    expect(membershipPauseCollectionRetryDelayMs(40)).toBe(capped)
    expect(capped).toBeLessThanOrEqual(day)
  })
})
