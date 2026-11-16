import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { markImageModerationFlagged } from '@voucha/test-helpers'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import {
  openHeldCounterNoticeRestore,
  recordOrdinaryCopyrightHold,
} from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { observeTestPostgresClientQueries } from '@voucha/test-helpers/postgres-query-pool-observer'
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
      const factsRead = Promise.withResolvers<void>()
      const holdReady = Promise.withResolvers<void>()
      const eventAttempt = Promise.withResolvers<void>()
      onTestFinished(() => {
        factsRead.resolve()
        holdReady.resolve()
        eventAttempt.resolve()
      })
      let prepared = false
      const restoreIntercept = interceptPostgresTransactionQueriesForTest(
        (text, values) => {
          if (text.includes('preemptCopyrightRestorations') && values.includes(scene.notice.id)) {
            holdReady.resolve()
            return true
          }
          if (
            (text.includes('processCopyrightActionIntent:event') &&
              values.includes(scene.restore.id)) ||
            (text.includes('createDeterministicCopyrightCorrespondencesInTransaction') &&
              values.some(value => Array.isArray(value) && value.includes(scene.notice.id)))
          ) {
            eventAttempt.resolve()
          }
          return false
        },
        () => eventAttempt.promise,
      )
      let hold: ReturnType<typeof recordOrdinaryCopyrightHold> | undefined
      try {
        const { result } = await observeTestPostgresClientQueries(
          async () => {
            const restoring = processCopyrightActionIntent(scene.restore.id, scene.restorationAt)
            void restoring.catch((err: unknown) => {
              factsRead.reject(err)
              holdReady.resolve()
              eventAttempt.resolve()
            })
            await factsRead.promise
            hold = recordOrdinaryCopyrightHold(scene)
            void hold.catch(holdReady.reject)
            return Promise.allSettled([restoring, hold])
          },
          async query => {
            if (prepared) return
            const unavailableReady =
              unavailable &&
              query.text.includes('copyrightActionDeliveryFacts') &&
              query.values.includes(scene.restore.id)
            const authorizationReady =
              !unavailable &&
              query.text.includes('processCopyrightActionIntent:otherActiveRestrictions') &&
              query.values.includes(scene.target.placement_id)
            if (!unavailableReady && !authorizationReady) return
            prepared = true
            factsRead.resolve()
            await holdReady.promise
          },
        )
        expect(result[0]).toMatchObject({ status: 'rejected', reason: { status: 409 } })
        expect(result[1]?.status).toBe('fulfilled')
      } finally {
        holdReady.resolve()
        eventAttempt.resolve()
        restoreIntercept()
        if (hold) await Promise.allSettled([hold])
      }
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
        'processCopyrightActionIntent:event',
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
        await expect(action).rejects.toMatchObject({ status: 409 })
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
  it('rolls back tentative authorization when a competing placement transition wins', async () => {
    const edge = installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const before = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    edge.put.mockClear()
    let changed = false
    let winner: Awaited<ReturnType<typeof getImagePlacementForCopyright>> = null
    const restore = interceptPostgresTransactionQueriesForTest(
      (text, values) =>
        !changed &&
        text.includes('/* changeImagePlacementsCopyrightWithholding */') &&
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
      ).rejects.toMatchObject({ status: 409 })
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
      state: 'pending',
      completed_at_reason: null,
      failure_message: 'Concurrent copyright restoration changed the remaining grounds',
    })
    expect(edge.put).not.toHaveBeenCalled()
  })
  it('reports a conflict when blocked completion races a committed lease release', async () => {
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
        text.includes('/* completeCopyrightActionIntentInTransaction */') &&
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
      ).rejects.toMatchObject({ status: 409 })
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
