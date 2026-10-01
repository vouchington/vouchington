import { describe, expect, it } from 'vitest'
import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import {
  commitTestCopyrightHoldResolution,
  replayTestAutomaticCopyrightRestore,
} from '@voucha/test-helpers/services/copyright-notices/hold-restoration'
import { readTestOwnedCopyrightSweepIds } from '@voucha/test-helpers/services/copyright-notices/sweep-ids'
import {
  appendCopyrightLegalHoldAssessment,
  appendCopyrightNoticeSubmission,
  processCopyrightActionIntent,
  searchRecoverableCopyrightActionIntentIds,
} from './index.mts'
import {
  claimCopyrightActionIntent,
  failCopyrightActionIntent,
  replayFailedCopyrightActionIntent,
} from './action-delivery-state.mts'
import {
  openHeldCounterNoticeRestore,
  recordOrdinaryCopyrightHold,
} from './restoration-hold-scene.mts'
import { createCounterNoticeRestoreIntent } from './evidence-and-holds-restoration-hold-fixtures.mts'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

const publish = async () => undefined

async function exhaustedRestoreWithSibling() {
  const scene = await openHeldCounterNoticeRestore(
    createTestCopyrightDeliveryDependencies(publish),
    2,
  )
  for (const attempt of [1, 2, 3, 4, 5]) {
    const attemptedAt = new Date(scene.restorationAt.getTime() + attempt * 60 * 60 * 1000)
    const claim = await claimCopyrightActionIntent(scene.restore.id, attemptedAt)
    expect(claim).not.toBeNull()
    await expect(
      failCopyrightActionIntent({
        intentId: scene.restore.id,
        leaseToken: claim!.lease_token,
        failedAt: attemptedAt,
        failureMessage: 'External provider unavailable.',
      }),
    ).resolves.toBe(attempt === 5 ? 'failed' : 'retrying')
  }
  const before = await getCopyrightNoticePrivateAggregate(scene.notice.id)
  const failed = before?.actionIntents.find(intent => intent.id === scene.restore.id)
  expect(failed).toMatchObject({ state: 'failed', delivery_attempt_count: 5 })
  const other = before?.targets.find(target => target.id !== scene.target.id)
  const restriction = before?.restrictions.find(row => row.copyright_notice_target_id === other?.id)
  if (!other || !restriction) throw new Error('Second restriction fixture disappeared')
  const sibling = await createCounterNoticeRestoreIntent({
    claimant: scene.claimant,
    noticeId: scene.notice.id,
    moderator: scene.moderator,
    targetId: other.id,
    restrictionId: restriction.id,
    placementRevision: other.placement_revision,
  })
  return { ...scene, failed, other, sibling }
}

describe('automatic hold restoration preserves provider failures', () => {
  it.each(['resolution', 'assessment'] as const)(
    '%s leaves a failed sibling unchanged',
    async transition => {
      const scene = await exhaustedRestoreWithSibling()
      let blockedResult: string
      let enqueueIds: string[] = []
      if (transition === 'resolution') {
        const hold = await recordOrdinaryCopyrightHold(scene, publish, [scene.other.id])
        blockedResult = await processCopyrightActionIntent(
          scene.sibling.restore.id,
          scene.sibling.now,
          createTestCopyrightDeliveryDependencies(publish),
        )
        enqueueIds = await commitTestCopyrightHoldResolution({
          currentUser: scene.moderator,
          assessmentId: hold.id,
          resolvedAt: scene.sibling.now,
          resolutionKind: 'dismissed',
          rationale: 'Sibling target proceeding dismissed.',
        })
      } else {
        const submission = await appendCopyrightNoticeSubmission({
          noticeId: scene.notice.id,
          kind: 'court_or_ccb_hold',
          receivedAt: scene.sibling.now,
          sourceKind: 'email',
          submittedByUserId: null,
          bodyCiphertext: `filing-${crypto.randomUUID()}`,
        })
        blockedResult = await processCopyrightActionIntent(
          scene.sibling.restore.id,
          scene.sibling.now,
          createTestCopyrightDeliveryDependencies(publish),
        )
        await appendCopyrightLegalHoldAssessment({
          currentUser: scene.moderator,
          submissionId: submission.id,
          assessedAt: scene.sibling.now,
          fromOriginalClaimant: false,
          proceedingKind: null,
          ccbClaimKind: null,
          commencedAt: null,
          receivedByDesignatedAgentAt: null,
          sameMaterial: false,
          targetIds: [scene.other.id],
          rationale: 'Filing does not establish a qualifying proceeding.',
        })
      }
      expect(blockedResult).toBe('blocked')
      expect(enqueueIds).toEqual(transition === 'resolution' ? [scene.sibling.restore.id] : [])
      const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
      expect(after?.actionIntents.find(intent => intent.id === scene.restore.id)).toEqual(
        scene.failed,
      )
      expect(
        after?.actionIntents.find(intent => intent.id === scene.sibling.restore.id)?.state,
      ).toBe('pending')
      await expect(
        readTestOwnedCopyrightSweepIds(
          options =>
            searchRecoverableCopyrightActionIntentIds({ ...options, now: scene.sibling.now }),
          scene.restore.id,
        ),
      ).resolves.toEqual([])
      expect(
        after?.lifecycleEvents.filter(event => event.event_type === 'copyright_action_replayed'),
      ).toHaveLength(1)
    },
  )

  it('rejects a failed intent supplied directly to the automatic locked replay', async () => {
    const scene = await exhaustedRestoreWithSibling()
    await expect(
      replayTestAutomaticCopyrightRestore({
        noticeId: scene.notice.id,
        intentId: scene.restore.id,
        now: scene.sibling.now,
      }),
    ).resolves.toEqual([])
    await expect(
      replayFailedCopyrightActionIntent({
        noticeId: scene.notice.id,
        intentId: scene.restore.id,
        actorUserId: scene.moderator.id,
      }),
    ).resolves.toBe(true)
    const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(after?.actionIntents.find(intent => intent.id === scene.restore.id)).toMatchObject({
      state: 'pending',
      delivery_attempt_count: 0,
    })
    expect(
      after?.lifecycleEvents.filter(event => event.event_type === 'copyright_action_replayed'),
    ).toEqual([
      expect.objectContaining({
        actor_user_id: scene.moderator.id,
        copyright_notice_action_intent_id: scene.restore.id,
        replay_reason: 'operator_replay',
      }),
    ])
  })
})
