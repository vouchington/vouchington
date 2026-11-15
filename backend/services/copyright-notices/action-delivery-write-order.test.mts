import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { createCounterNoticeRestoreIntent } from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { raceCopyrightActionWithHold } from '@voucha/test-helpers/copyright-action-write-order'
import { appendCopyrightLegalHoldAssessment } from './holds.mts'
import {
  claimCopyrightActionIntent,
  replayFailedCopyrightActionIntent,
} from './action-delivery-state.mts'
import { failCopyrightActionIntent } from './action-delivery-completion.mts'
import { processCopyrightActionIntent } from './action-delivery-process.mts'
import { publishStagedMediaDeliveryRecord } from '@services/media-delivery-safety'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'

describe('copyright action and legal hold write order', () => {
  let edge: ReturnType<typeof installTestMediaDeliveryEdge>
  beforeEach(() => {
    edge = installTestMediaDeliveryEdge()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('commits operator replay and a hold preempting a sibling restore', async () => {
    const scene = await openHeldCounterNoticeRestore(2)
    for (const attempt of [1, 2, 3, 4, 5]) {
      const now = new Date(scene.restorationAt.getTime() + attempt * 60 * 60 * 1000)
      const claim = await claimCopyrightActionIntent(scene.restore.id, now)
      expect(claim).not.toBeNull()
      await expect(
        failCopyrightActionIntent({
          intentId: scene.restore.id,
          leaseToken: claim!.lease_token,
          failedAt: now,
          failureMessage: 'External provider unavailable.',
        }),
      ).resolves.toBe(attempt === 5 ? 'failed' : 'retrying')
    }
    const before = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    const other = before?.targets.find(target => target.id !== scene.target.id)
    const restriction = before?.restrictions.find(
      row => row.copyright_notice_target_id === other?.id,
    )
    if (!other || !restriction) throw new Error('Sibling copyright target disappeared')
    const sibling = await createCounterNoticeRestoreIntent({
      claimant: scene.claimant,
      moderator: scene.moderator,
      noticeId: scene.notice.id,
      targetId: other.id,
      restrictionId: restriction.id,
      placementRevision: other.placement_revision,
    })
    const submission = await appendTestCopyrightNoticeSubmission({
      noticeId: scene.notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: sibling.now,
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `filing-${crypto.randomUUID()}`,
    })
    const outcomes = await raceCopyrightActionWithHold({
      noticeId: scene.notice.id,
      intentId: scene.restore.id,
      eventMarker: '/* replayFailedCopyrightActionIntent:event */',
      action: () =>
        replayFailedCopyrightActionIntent({
          intentId: scene.restore.id,
          noticeId: scene.notice.id,
          actorUserId: scene.moderator.id,
        }),
      hold: () =>
        appendCopyrightLegalHoldAssessment({
          currentUser: scene.moderator,
          submissionId: submission.id,
          assessedAt: sibling.now,
          fromOriginalClaimant: true,
          proceedingKind: 'federal_court',
          ccbClaimKind: null,
          commencedAt: new Date('2026-07-03T11:00:00.000Z'),
          receivedByDesignatedAgentAt: sibling.now,
          sameMaterial: true,
          targetIds: [other.id],
          rationale: 'Verified proceeding on the sibling target.',
        }),
    })
    expect(outcomes).toEqual([
      { status: 'fulfilled', value: true },
      { status: 'fulfilled', value: expect.objectContaining({ target_ids: [other.id] }) },
    ])
    const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(after?.actionIntents.find(intent => intent.id === scene.restore.id)).toMatchObject({
      state: 'pending',
      attempt_count: 0,
    })
    expect(after?.actionIntents.find(intent => intent.id === sibling.restore.id)).toMatchObject({
      state: 'blocked',
    })
    expect(
      after?.lifecycleEvents.filter(event => event.change_type === 'copyright_action_replayed'),
    ).toEqual([
      expect.objectContaining({
        changed_by_id: scene.moderator.id,
        copyright_notice_action_intent_id: scene.restore.id,
        replay_reason: 'operator_replay',
      }),
    ])
  })

  it.each(['sibling', 'same'] as const)(
    'settles normal completion racing a hold on the %s target',
    async scope => {
      const scene = await openHeldCounterNoticeRestore(2)
      const before = await getCopyrightNoticePrivateAggregate(scene.notice.id)
      const other = before?.targets.find(target => target.id !== scene.target.id)
      const restriction = before?.restrictions.find(
        row => row.copyright_notice_target_id === other?.id,
      )
      if (!other || !restriction) throw new Error('Sibling copyright target disappeared')
      const sibling = await createCounterNoticeRestoreIntent({
        claimant: scene.claimant,
        moderator: scene.moderator,
        noticeId: scene.notice.id,
        targetId: other.id,
        restrictionId: restriction.id,
        placementRevision: other.placement_revision,
      })
      const heldTarget = scope === 'same' ? scene.target.id : other.id
      let submissionId = ''
      let deliveryPublished = false
      let deliveryKey = ''
      const outcomes = await raceCopyrightActionWithHold({
        noticeId: scene.notice.id,
        intentId: scene.restore.id,
        eventMarker: '/* processCopyrightActionIntent:event */',
        eventType: 'placement_restored',
        completion: {
          restrictionId: scene.restriction.id,
          deliveryPublished: () => deliveryPublished,
          fileHold: async () => {
            const submission = await appendTestCopyrightNoticeSubmission({
              noticeId: scene.notice.id,
              kind: 'court_or_ccb_hold',
              receivedAt: scene.restorationAt,
              sourceKind: 'email',
              submittedByUserId: null,
              bodyCiphertext: `filing-${crypto.randomUUID()}`,
            })
            submissionId = submission.id
          },
        },
        action: () =>
          processCopyrightActionIntent(scene.restore.id, scene.restorationAt, {
            publishStagedMediaDeliveryRecord: async recordId => {
              await publishStagedMediaDeliveryRecord(recordId)
              const tuple = await getImagePlacementForCopyright(scene.target.placement_id)
              if (!tuple) throw new Error('Published restoration tuple disappeared')
              deliveryKey = getImagePlacementDeliveryKey({
                placementId: tuple.placementId,
                revision: tuple.revision,
                imageId: tuple.imageId,
              })
              expect(edge.records.get(deliveryKey)?.state).toBe('allow')
              deliveryPublished = true
            },
          }),
        hold: () =>
          appendCopyrightLegalHoldAssessment({
            currentUser: scene.moderator,
            submissionId,
            assessedAt: scene.restorationAt,
            fromOriginalClaimant: true,
            proceedingKind: 'federal_court',
            ccbClaimKind: null,
            commencedAt: new Date('2026-07-03T11:00:00.000Z'),
            receivedByDesignatedAgentAt: scene.restorationAt,
            sameMaterial: true,
            targetIds: [heldTarget],
            rationale: 'Verified proceeding while restore completion was pending.',
          }),
      })
      expect(outcomes[1]).toEqual({
        status: 'fulfilled',
        value: expect.objectContaining({ target_ids: [heldTarget] }),
      })
      const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
      const completed = after?.lifecycleEvents.filter(
        event =>
          event.change_type === 'placement_restored' &&
          event.copyright_notice_action_intent_id === scene.restore.id,
      )
      const expected =
        scope === 'same'
          ? {
              outcome: {
                status: 'rejected',
                reason: new Error('Copyright action lease expired before completion'),
              },
              state: 'blocked',
              siblingState: 'pending',
              completedCount: 0,
              edgeState: 'withheld',
            }
          : {
              outcome: { status: 'fulfilled', value: 'applied' },
              state: 'completed',
              siblingState: 'blocked',
              completedCount: 1,
              edgeState: 'allow',
            }
      expect(outcomes[0]).toEqual(expected.outcome)
      expect(after?.actionIntents.find(intent => intent.id === scene.restore.id)).toMatchObject({
        state: expected.state,
      })
      expect(after?.actionIntents.find(intent => intent.id === sibling.restore.id)).toMatchObject({
        state: expected.siblingState,
      })
      expect(completed).toHaveLength(expected.completedCount)
      expect(edge.records.get(deliveryKey)?.state).toBe(expected.edgeState)
    },
  )

  it('preserves a newer owner completion and allow for the same restored tuple', async () => {
    const scene = await openHeldCounterNoticeRestore()
    const atCompletion = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const restore = beforePostgresTransactionQueryForTest(
      '/* processCopyrightActionIntent:event */',
      values => values.includes(scene.restore.id) && values.includes('placement_restored'),
      async () => {
        atCompletion.resolve()
        await resume.promise
      },
    )
    const original = processCopyrightActionIntent(scene.restore.id, scene.restorationAt)
    const originalSettled = Promise.allSettled([original])
    let deliveryKey = ''
    try {
      await Promise.race([
        atCompletion.promise,
        original.then(() => {
          throw new Error('Original worker did not reach its completion boundary')
        }),
      ])
      const tuple = await getImagePlacementForCopyright(scene.target.placement_id)
      if (!tuple) throw new Error('Restored tuple disappeared')
      deliveryKey = getImagePlacementDeliveryKey({
        placementId: tuple.placementId,
        revision: tuple.revision,
        imageId: tuple.imageId,
      })
      await expect(
        processCopyrightActionIntent(
          scene.restore.id,
          new Date(scene.restorationAt.getTime() + 6 * 60 * 1000),
        ),
      ).resolves.toBe('applied')
      expect(edge.records.get(deliveryKey)?.state).toBe('allow')
    } finally {
      resume.resolve()
      await originalSettled
      restore()
    }
    expect(await originalSettled).toEqual([
      {
        status: 'rejected',
        reason: new Error('Copyright action lease expired before completion'),
      },
    ])
    const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(after?.actionIntents.find(intent => intent.id === scene.restore.id)).toMatchObject({
      state: 'completed',
      attempt_count: 2,
    })
    expect(
      after?.lifecycleEvents.filter(
        event =>
          event.change_type === 'placement_restored' &&
          event.copyright_notice_action_intent_id === scene.restore.id,
      ),
    ).toHaveLength(1)
    expect(edge.records.get(deliveryKey)?.state).toBe('allow')
  })
})
