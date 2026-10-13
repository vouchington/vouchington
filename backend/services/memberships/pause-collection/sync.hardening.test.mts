import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as stripeClientModule from '@modules/stripe/client'
import {
  createTestMembership,
  callWithPauseCollectionReplicaMiss,
  createTestPauseCollectionDirectSubscription,
  createTestUser,
  deleteTestMembershipPauseCollectionWork,
  getTestMembershipPauseCollectionWork,
  installExpiredTestMembershipPauseCollectionLease,
  queueTestPauseCollectionSync,
  readTestPauseCollectionSyncJobs,
  recordTestMembershipPauseCollectionWork,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { dispatchDuePauseCollectionWork } from './dispatch.mts'
import { syncMembershipPauseCollection } from './sync.mts'

type Pause = { behavior: 'void'; resumes_at?: number | null } | null

describe('membership pause collection edges', () => {
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

  it('does not pause a granted membership', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    await createTestMembership({ user_id: member.id, plan: 'plus', granted_by_id: admin.id })
    await suspendTestUser(member.id)
    await queueTestPauseCollectionSync(member.id)
    const [job] = await readTestPauseCollectionSyncJobs(member.id)

    await syncMembershipPauseCollection(job!)
    await syncMembershipPauseCollection(job!)

    expect(retrieve).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('clears nothing when a lifted user has no direct subscription', async () => {
    const member = await createTestUser()
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

    expect(retrieve).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('pauses a direct subscription the replica does not see', async () => {
    const member = await createTestUser()
    await suspendTestUser(member.id)
    await createTestPauseCollectionDirectSubscription(member.id)
    await queueTestPauseCollectionSync(member.id)
    const [job] = await readTestPauseCollectionSyncJobs(member.id)

    await callWithPauseCollectionReplicaMiss(() => syncMembershipPauseCollection(job!))

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('does not update an already canceled Stripe subscription', async () => {
    const member = await createTestUser()
    await createTestPauseCollectionDirectSubscription(member.id)
    retrieve.mockImplementation(async (id: string) => ({
      id,
      status: 'canceled',
      pause_collection: null,
    }))
    await suspendTestUser(member.id)
    await queueTestPauseCollectionSync(member.id)
    const [job] = await readTestPauseCollectionSyncJobs(member.id)

    await syncMembershipPauseCollection(job!)
    await syncMembershipPauseCollection(job!)

    expect(update).not.toHaveBeenCalled()
  })

  it('reclaims an expired lease when unleased work fills the page', async () => {
    const expired = await createTestUser()
    const queued = await createTestUser()
    await installExpiredTestMembershipPauseCollectionLease(expired.id)
    await recordTestMembershipPauseCollectionWork(queued.id)
    const before = await getTestMembershipPauseCollectionWork(expired.id)
    let unleasedWon = false
    for (let attempt = 0; attempt < 6; attempt++) {
      const held = await getTestMembershipPauseCollectionWork(expired.id)
      if (held?.leaseToken && held.leaseToken !== before?.leaseToken) break
      const claimedIds = (await dispatchDuePauseCollectionWork(1)).map(row => row.userId)
      const afterClaim = await getTestMembershipPauseCollectionWork(expired.id)
      const stillWaiting = afterClaim?.leaseToken === before?.leaseToken
      if (claimedIds.includes(queued.id) && stillWaiting) unleasedWon = true
      if (claimedIds.includes(expired.id) || !stillWaiting) break
    }
    const after = await getTestMembershipPauseCollectionWork(expired.id)
    expect(unleasedWon).toBe(false)
    expect(after?.leaseToken).not.toBe(before?.leaseToken)
    await deleteTestMembershipPauseCollectionWork(expired.id)
    await deleteTestMembershipPauseCollectionWork(queued.id)
  })
})
