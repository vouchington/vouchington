import { afterEach, describe, expect, it, vi } from 'vitest'
import { beginTransaction } from '@data-stores/psql'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { observeTestPostgresClientQueries } from '@voucha/test-helpers/postgres-query-pool-observer'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { isTestCopyrightPlacementWithheld } from '@voucha/test-helpers/services/copyright-notices/hold-restoration'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { appendCopyrightGuestFiling, processCopyrightActionIntent } from './index.mts'
import {
  claimCopyrightActionIntent,
  completeCopyrightActionIntentInTransaction,
  lockCopyrightActionDelivery,
} from './action-delivery-state.mts'
import { issueCopyrightGuestCapability } from './guest-capabilities.mts'

async function restoreState(noticeId: string, intentId: string) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  return aggregate!.actionIntents.find(intent => intent.id === intentId)!
}

describe('copyright restore serialization', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('lets the retried restore see that the other restriction lifted, so the placement is restored', async () => {
    installTestMediaDeliveryEdge()
    const first = await openHeldCounterNoticeRestore()
    const second = await openHeldCounterNoticeRestore(1, {
      claimant: first.claimant,
      placementId: first.target.placement_id,
      imageId: first.target.image_id,
    })
    const now = new Date(
      Math.max(first.restorationAt.getTime(), second.restorationAt.getTime()) + 1000,
    )
    expect(await isTestCopyrightPlacementWithheld(first.target.placement_id)).toBe(true)

    // Both restores read the other restriction as active before either lifts its own.
    const bothRead = Promise.withResolvers<void>()
    let reads = 0
    const { result: settled } = await observeTestPostgresClientQueries(
      () =>
        Promise.allSettled([
          processCopyrightActionIntent(first.restore.id, now),
          processCopyrightActionIntent(second.restore.id, now),
        ]),
      async query => {
        if (!query.text.includes('processCopyrightActionIntent:otherActiveRestrictions')) return
        if (++reads === 2) bothRead.resolve()
        await bothRead.promise
      },
    )

    const rejected = settled.filter(outcome => outcome.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect(rejected[0]!.reason).toMatchObject({ code: '40001' })
    expect(await isTestCopyrightPlacementWithheld(first.target.placement_id)).toBe(true)

    const later = new Date(now.getTime() + 60 * 60 * 1000)
    const retried = settled[0].status === 'rejected' ? first : second
    await expect(processCopyrightActionIntent(retried.restore.id, later)).resolves.toBe('applied')
    expect(await isTestCopyrightPlacementWithheld(first.target.placement_id)).toBe(false)
  })

  it('lands a filing strictly after a restore whose finalization already holds the work item', async () => {
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const { token } = await issueCopyrightGuestCapability({
      currentUser: scene.moderator,
      noticeId: scene.notice.id,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })
    const claimed = await claimCopyrightActionIntent(scene.restore.id, scene.restorationAt)
    expect(claimed).not.toBeNull()

    // Finalization's own lock: the work item row is held until its completion commits.
    await using holder = await beginTransaction()
    await lockCopyrightActionDelivery(claimed!.id, claimed!.lease_token, holder)
    const filing = await withTestOwnedPostgresWait(
      {
        holderProcessId: await getTestPostgresBackendProcessId(holder),
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'preemptCopyrightRestorations',
        releaseHolder: () => holder[Symbol.asyncDispose](),
      },
      async waitForLock => {
        const pending = appendCopyrightGuestFiling({
          noticeId: scene.notice.id,
          token,
          now: new Date(),
          kind: 'court_or_ccb_hold',
          statement: 'A federal court action was filed.',
        })
        // Admission waits for the row finalization holds instead of skipping it.
        await waitForLock(pending)
        await completeCopyrightActionIntentInTransaction({
          intentId: claimed!.id,
          leaseToken: claimed!.lease_token,
          outcome: 'completed',
          completedAt: scene.restorationAt,
          query: holder,
        })
        await holder.commit()
        return pending
      },
    )

    expect(filing.kind).toBe('court_or_ccb_hold')
    // Preemption re-evaluated after the wait and found the restore already complete.
    expect((await restoreState(scene.notice.id, scene.restore.id)).state).toBe('completed')
  })
})
