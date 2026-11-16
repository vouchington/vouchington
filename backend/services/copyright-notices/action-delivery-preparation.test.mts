import { afterEach, describe, expect, it, vi } from 'vitest'
import { markImageModerationFlagged } from '@voucha/test-helpers'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import {
  openHeldCounterNoticeRestore,
  recordOrdinaryCopyrightHold,
} from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { raceCopyrightPreparationWithGuestFiling } from '@voucha/test-helpers/copyright-preparation-guest-race'
import { interceptPostgresTransactionQueriesForTest } from '@voucha/test-helpers/injected-transaction-queries'
import {
  getImagePlacementForCopyright,
  restoreImagePlacementForCopyright,
  withholdImagePlacementForCopyright,
} from '@services/images/placements'
import { processCopyrightActionIntent } from './index.mts'
import { failCopyrightActionIntent } from './action-delivery-state.mts'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'

describe('copyright restore preparation admission', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each([false, true])(
    'retains a hold admitted during preparation (unavailable: %s)',
    async unavailable => {
      const edge = installTestMediaDeliveryEdge()
      const scene = await openHeldCounterNoticeRestore()
      if (unavailable) await markImageModerationFlagged(scene.target.image_id)
      edge.put.mockClear()
      const result = await raceCopyrightPreparationWithGuestFiling({
        intentId: scene.restore.id,
        noticeId: scene.notice.id,
        restrictionId: scene.restriction.id,
        action: () => processCopyrightActionIntent(scene.restore.id, scene.restorationAt),
        filing: () => recordOrdinaryCopyrightHold(scene),
      })
      expect(result[0]).toEqual({ status: 'fulfilled', value: 'not_claimed' })
      expect(result[1].status).toBe('fulfilled')
      const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
      expect(after?.actionIntents.find(row => row.id === scene.restore.id)).toMatchObject({
        state: 'blocked',
        completed_at_reason: 'blocked',
      })
      expect(after?.restrictions.find(row => row.id === scene.restriction.id)?.lifted_at).toBeNull()
      expect(
        after?.lifecycleEvents.filter(
          row =>
            row.copyright_notice_action_intent_id === scene.restore.id &&
            ['restoration_authorized_pending_delivery', 'restoration_unavailable'].includes(
              row.change_type,
            ),
        ),
      ).toEqual([])
      expect(edge.put.mock.calls.filter(([record]) => record.state === 'allow')).toEqual([])
      expect((await getImagePlacementForCopyright(scene.target.placement_id))?.withheld).toBe(true)
    },
  )
  it.each([false, true])(
    'rolls back tentative restoration after lease release (unavailable: %s)',
    async unavailable => {
      const edge = installTestMediaDeliveryEdge()
      const scene = await openHeldCounterNoticeRestore()
      if (unavailable) await markImageModerationFlagged(scene.target.image_id)
      const before = await getCopyrightNoticePrivateAggregate(scene.notice.id)
      const placement = await getImagePlacementForCopyright(scene.target.placement_id)
      edge.put.mockClear()
      let released = false
      const restore = beforePostgresTransactionQueryForTest(
        'readCopyrightActionPreparation',
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
              failureMessage: 'Another execution released this lease.',
            }),
          ).resolves.toBe('retrying')
        },
      )
      try {
        const action = processCopyrightActionIntent(scene.restore.id, scene.restorationAt)
        await expect(action).resolves.toBe('not_claimed')
      } finally {
        restore()
      }
      expect(released).toBe(true)
      const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
      expect(after?.lifecycleEvents).toEqual(before?.lifecycleEvents)
      expect(after?.restrictions).toEqual(before?.restrictions)
      expect(after?.deadlines).toEqual(before?.deadlines)
      expect(await getImagePlacementForCopyright(scene.target.placement_id)).toEqual(placement)
      expect(edge.put).not.toHaveBeenCalled()
    },
  )
  it('keeps the newer placement when a competing transition wins before its placement check', async () => {
    const edge = installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const before = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    edge.put.mockClear()
    let changed = false
    let winner: Awaited<ReturnType<typeof getImagePlacementForCopyright>> = null
    const restore = interceptPostgresTransactionQueriesForTest(
      (text, values) =>
        !changed &&
        text.includes('/* lockCopyrightPlacementTransitions */') &&
        values.some(value => Array.isArray(value) && value.includes(scene.target.placement_id)),
      async () => {
        changed = true
        const current = await getImagePlacementForCopyright(scene.target.placement_id)
        if (!current) throw new Error('Placement disappeared')
        await restoreImagePlacementForCopyright({
          placementId: current.placementId,
          expectedRevision: current.revision,
        })
        await withholdImagePlacementForCopyright({
          placementId: current.placementId,
          expectedRevision: current.revision + 1,
        })
        await restoreImagePlacementForCopyright({
          placementId: current.placementId,
          expectedRevision: current.revision + 2,
        })
        winner = await getImagePlacementForCopyright(current.placementId)
      },
    )
    try {
      await expect(
        processCopyrightActionIntent(scene.restore.id, scene.restorationAt),
      ).resolves.toBe('stale')
    } finally {
      restore()
    }
    expect(changed).toBe(true)
    expect(await getImagePlacementForCopyright(scene.target.placement_id)).toEqual(winner)
    const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(after?.lifecycleEvents).toEqual(before?.lifecycleEvents)
    expect(after?.restrictions).toEqual(before?.restrictions)
    expect(after?.deadlines).toEqual(before?.deadlines)
    expect(after?.actionIntents.find(row => row.id === scene.restore.id)).toMatchObject({
      state: 'stale',
      completed_at_reason: 'stale',
      failure_message: 'Authoritative placement no longer matches the intent revision and asset.',
    })
    expect(edge.put).not.toHaveBeenCalled()
  })
  it('leaves a committed lease release intact before blocked completion', async () => {
    const edge = installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    await appendTestCopyrightNoticeSubmission({
      noticeId: scene.notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: scene.restorationAt,
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `pending-filing-${crypto.randomUUID()}`,
    })
    const before = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    const placement = await getImagePlacementForCopyright(scene.target.placement_id)
    edge.put.mockClear()
    let released = false
    const restore = interceptPostgresTransactionQueriesForTest(
      (text, values) =>
        !released &&
        text.includes('readCopyrightActionPreparation') &&
        values.includes(scene.restore.id),
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
            failureMessage: 'A concurrent worker released this lease.',
          }),
        ).resolves.toBe('retrying')
      },
    )
    try {
      await expect(
        processCopyrightActionIntent(scene.restore.id, scene.restorationAt),
      ).resolves.toBe('not_claimed')
    } finally {
      restore()
    }
    expect(released).toBe(true)
    const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(after?.lifecycleEvents).toEqual(before?.lifecycleEvents)
    expect(after?.restrictions).toEqual(before?.restrictions)
    expect(after?.deadlines).toEqual(before?.deadlines)
    expect(await getImagePlacementForCopyright(scene.target.placement_id)).toEqual(placement)
    expect(after?.actionIntents.find(row => row.id === scene.restore.id)).toMatchObject({
      state: 'pending',
      failure_message: 'A concurrent worker released this lease.',
    })
    expect(edge.put).not.toHaveBeenCalled()
  })
})
