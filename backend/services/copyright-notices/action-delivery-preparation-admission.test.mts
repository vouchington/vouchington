import { readTestCopyrightGuestEventClocks } from '@voucha/test-helpers/copyright-guest-filing-constraints'
import { beginTransaction } from '@data-stores/psql'
import { markImageModerationFlagged } from '@voucha/test-helpers'
import { readCopyrightActionPreparation } from './action-delivery-preparation-facts.mts'
import { prepareUnavailableCopyrightRestore } from './action-delivery-preparation-unavailable.mts'
import { withCopyrightPreparationTransaction } from './action-delivery-preparation-admission.mts'
import {
  claimCopyrightActionIntent,
  completeCopyrightActionIntentInTransaction,
  failCopyrightActionIntent,
  insertCopyrightActionLifecycleEvent,
} from './action-delivery-state.mts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import {
  getImagePlacementForCopyright,
  restoreImagePlacementForCopyright,
} from '@services/images/placements'
import { processCopyrightActionIntent } from './index.mts'

describe('copyright preparation denial receipt', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it('propagates a postcommit denial receipt lease loss through compensation', async () => {
    const edge = installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const current = await getImagePlacementForCopyright(scene.target.placement_id)
    if (!current) throw new Error('Placement disappeared')
    await restoreImagePlacementForCopyright({
      placementId: current.placementId,
      expectedRevision: current.revision,
    })
    await appendTestCopyrightNoticeSubmission({
      noticeId: scene.notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: scene.restorationAt,
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `receipt-filing-${crypto.randomUUID()}`,
    })
    edge.put.mockClear()
    let released = false
    const restore = beforePostgresTransactionQueryForTest(
      '/* completeCopyrightActionIntentInTransaction */',
      values => values.includes(scene.restore.id),
      async () => {
        released = true
        const claimed = (
          await getCopyrightNoticePrivateAggregate(scene.notice.id)
        )?.actionIntents.find(row => row.id === scene.restore.id)
        if (!claimed?.lease_token) throw new Error('Claimed lease disappeared')
        await expect(
          failCopyrightActionIntent({
            intentId: scene.restore.id,
            leaseToken: claimed.lease_token,
            failedAt: scene.restorationAt,
            failureMessage: 'A concurrent execution released the receipt lease.',
          }),
        ).resolves.toBe('retrying')
      },
    )
    try {
      await expect(
        processCopyrightActionIntent(scene.restore.id, scene.restorationAt),
      ).rejects.toThrow('Copyright action lease expired before completion')
    } finally {
      restore()
    }
    expect(released).toBe(true)
    expect(edge.put.mock.calls.map(([record]) => record.state)).toEqual(['withheld'])
    expect(
      (await getCopyrightNoticePrivateAggregate(scene.notice.id))?.actionIntents.find(
        row => row.id === scene.restore.id,
      ),
    ).toMatchObject({
      state: 'pending',
      failure_message: 'A concurrent execution released the receipt lease.',
    })
  })
  it('discards unavailable preparation audit when its lease was already released', async () => {
    const edge = installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    await markImageModerationFlagged(scene.target.image_id)
    const claimed = await claimCopyrightActionIntent(scene.restore.id, scene.restorationAt)
    if (!claimed) throw new Error('Restore claim missing')
    await using query = await beginTransaction()
    const legal = await readCopyrightActionPreparation(claimed.id, claimed.lease_token, query)
    const current = await getImagePlacementForCopyright(scene.target.placement_id)
    if (!legal || !current) throw new Error('Restore facts missing')
    await expect(
      failCopyrightActionIntent({
        intentId: claimed.id,
        leaseToken: claimed.lease_token,
        failedAt: scene.restorationAt,
        failureMessage: 'Released before tentative preparation.',
      }),
    ).resolves.toBe('retrying')
    edge.put.mockClear()
    await expect(
      prepareUnavailableCopyrightRestore({
        intent: claimed,
        legal,
        current,
        now: scene.restorationAt,
        query,
      }),
    ).resolves.toBe('not_claimed')
    const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(after?.actionIntents.find(row => row.id === claimed.id)).toMatchObject({
      state: 'pending',
      failure_message: 'Released before tentative preparation.',
    })
    expect(after?.restrictions.find(row => row.id === scene.restriction.id)?.lifted_at).toBeNull()
    expect(
      after?.lifecycleEvents.filter(
        row =>
          row.copyright_notice_action_intent_id === claimed.id &&
          ['restoration_unavailable', 'restoration_authorized_pending_delivery'].includes(
            row.change_type,
          ),
      ),
    ).toEqual([])
    expect(edge.put).not.toHaveBeenCalled()
    expect((await getImagePlacementForCopyright(scene.target.placement_id))?.withheld).toBe(true)
  })

  it('rolls back an owned completion CAS miss without masking its persisted release', async () => {
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const claimed = await claimCopyrightActionIntent(scene.restore.id, scene.restorationAt)
    if (!claimed) throw new Error('Restore claim missing')
    let legal
    {
      await using query = await beginTransaction()
      legal = await readCopyrightActionPreparation(claimed.id, claimed.lease_token, query)
    }
    if (!legal) throw new Error('Restore facts missing')
    await failCopyrightActionIntent({
      intentId: claimed.id,
      leaseToken: claimed.lease_token,
      failedAt: scene.restorationAt,
      failureMessage: 'Released before completion.',
    })
    const clocks = await readTestCopyrightGuestEventClocks(scene.notice.id)
    await expect(
      withCopyrightPreparationTransaction(async query => {
        await insertCopyrightActionLifecycleEvent(
          legal,
          claimed.id,
          'restoration_authorized_pending_delivery',
          query,
        )
        await completeCopyrightActionIntentInTransaction({
          intentId: claimed.id,
          leaseToken: claimed.lease_token,
          outcome: 'completed',
          completedAt: scene.restorationAt,
          query,
        })
        return 'applied'
      }),
    ).resolves.toBe('not_claimed')
    const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(await readTestCopyrightGuestEventClocks(scene.notice.id)).toEqual(clocks)
    expect(
      after?.lifecycleEvents.filter(
        row =>
          row.copyright_notice_action_intent_id === claimed.id &&
          row.change_type === 'restoration_authorized_pending_delivery',
      ),
    ).toEqual([])
    expect(
      (await getCopyrightNoticePrivateAggregate(scene.notice.id))?.actionIntents.find(
        row => row.id === claimed.id,
      ),
    ).toMatchObject({
      state: 'pending',
      completed_at: null,
      failure_message: 'Released before completion.',
    })
  })
})
