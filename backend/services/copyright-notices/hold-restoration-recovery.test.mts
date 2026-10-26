import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { describe, expect, it } from 'vitest'
import {
  createTestCopyrightDeliveryDependencies,
  type CopyrightTestDeliveryPublisher,
} from '@voucha/test-helpers/copyright-delivery-dependencies'
import {
  replayTestFailedCopyrightActionBehindHoldFence,
  cancelTestCopyrightRestorationDeadline,
  quarantineTestCopyrightRestorationImage,
  makeTestCopyrightRestorationImageUnready,
  retireTestCopyrightRestorationPlacement,
  supersedeTestCopyrightRestorationPlacementRevision,
} from '@voucha/test-helpers/services/copyright-notices/hold-restoration'
import {
  resolveCopyrightLegalHold,
  processCopyrightActionIntent,
  recoverBlockedCopyrightHoldRestorations,
} from './index.mts'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'
import { claimCopyrightActionIntent } from './action-delivery-state.mts'
import { failCopyrightActionIntent } from './action-delivery-completion.mts'
import {
  openHeldCounterNoticeRestore,
  recordOrdinaryCopyrightHold,
} from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

const publish: CopyrightTestDeliveryPublisher = async () => undefined

async function blockedCopyrightRestore(targetCount = 1) {
  const scene = await openHeldCounterNoticeRestore(
    createTestCopyrightDeliveryDependencies(publish),
    targetCount,
  )
  const hold = await recordOrdinaryCopyrightHold(
    scene,
    createTestCopyrightDeliveryDependencies(publish).prepublishImagePlacementDenial,
  )
  await expect(
    processCopyrightActionIntent(
      scene.restore.id,
      scene.restorationAt,
      createTestCopyrightDeliveryDependencies(publish),
    ),
  ).resolves.toBe('blocked')
  return { ...scene, hold }
}

async function exhaustDelivery(intentId: string, now: Date) {
  for (const attempt of [1, 2, 3, 4, 5]) {
    const attemptedAt = new Date(now.getTime() + attempt * 60 * 60 * 1000)
    const claim = await claimCopyrightActionIntent(intentId, attemptedAt)
    expect(claim).not.toBeNull()
    await expect(
      failCopyrightActionIntent({
        intentId,
        leaseToken: claim!.lease_token,
        failedAt: attemptedAt,
        failureMessage: 'External provider unavailable.',
      }),
    ).resolves.toBe(attempt === 5 ? 'failed' : 'retrying')
  }
}

describe('blocked copyright restoration recovery', () => {
  it.each([
    'unassessed',
    'unresolved',
    'cancelled',
    'superseded',
    'unsafe',
    'unready',
    'retired',
    'revision',
  ] as const)('retains the original blocked intent when %s prevents replay', async blocker => {
    const scene = await blockedCopyrightRestore()
    const aggregate = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    const original = aggregate?.actionIntents.find(intent => intent.id === scene.restore.id)
    if (blocker === 'unassessed')
      await appendTestCopyrightNoticeSubmission({
        noticeId: scene.notice.id,
        kind: 'court_or_ccb_hold',
        receivedAt: scene.restorationAt,
        sourceKind: 'email',
        submittedByUserId: null,
        bodyCiphertext: `filing-${crypto.randomUUID()}`,
      })
    if (blocker === 'cancelled')
      await cancelTestCopyrightRestorationDeadline(scene.restore.copyright_notice_deadline_id!)
    if (blocker === 'superseded') {
      const deadline = aggregate?.deadlines.find(
        record => record.id === scene.restore.copyright_notice_deadline_id,
      )
      const assessment = aggregate?.assessments.find(
        record => record.id === deadline?.qualifying_counter_notice_assessment_id,
      )
      if (!assessment) throw new Error('Original counter-notice assessment disappeared')
      await appendCopyrightSubmissionAssessment({
        submissionId: assessment.copyright_notice_submission_id,
        assessedAt: scene.restorationAt,
        currentUser: scene.moderator,
        substantiallyCompliant: false,
        supersedesAssessmentId: assessment.id,
      })
    }
    const imageId = aggregate?.targets.find(target => target.id === scene.target.id)?.image_id
    if (!imageId) throw new Error('Original image fixture disappeared')
    if (blocker === 'unsafe') await quarantineTestCopyrightRestorationImage(imageId)
    if (blocker === 'unready') await makeTestCopyrightRestorationImageUnready(imageId)
    if (blocker === 'retired')
      await retireTestCopyrightRestorationPlacement(scene.target.placement_id)
    if (blocker === 'revision')
      await supersedeTestCopyrightRestorationPlacementRevision(scene.target.placement_id)
    const now = scene.restorationAt
    if (blocker !== 'unresolved')
      await resolveCopyrightLegalHold({
        currentUser: scene.moderator,
        assessmentId: scene.hold.id,
        resolvedAt: now,
        resolutionKind: 'dismissed',
        rationale: `The test's ${blocker} gate remains active.`,
      })
    await expect(recoverBlockedCopyrightHoldRestorations(scene.notice.id, now)).resolves.toBe(0)
    await expect(recoverBlockedCopyrightHoldRestorations(scene.notice.id, now)).resolves.toBe(0)
    const retained = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(retained?.actionIntents.find(intent => intent.id === scene.restore.id)).toEqual(original)
    expect(
      retained?.lifecycleEvents.filter(event => event.change_type === 'copyright_action_replayed'),
    ).toEqual([])
  })

  it('makes manual failed replay wait at placement before taking its intent row', async () => {
    const scene = await openHeldCounterNoticeRestore(
      createTestCopyrightDeliveryDependencies(publish),
    )
    await exhaustDelivery(scene.restore.id, scene.restorationAt)
    await expect(
      replayTestFailedCopyrightActionBehindHoldFence({
        intentId: scene.restore.id,
        noticeId: scene.notice.id,
        actorUserId: scene.moderator.id,
      }),
    ).resolves.toBe(true)
    const aggregate = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(aggregate?.actionIntents.find(intent => intent.id === scene.restore.id)?.state).toBe(
      'pending',
    )
    expect(
      aggregate?.lifecycleEvents.filter(event => event.change_type === 'copyright_action_replayed'),
    ).toEqual([
      expect.objectContaining({
        changed_by_id: scene.moderator.id,
        copyright_notice_action_intent_id: scene.restore.id,
        replay_reason: 'operator_replay',
      }),
    ])
  })
})
