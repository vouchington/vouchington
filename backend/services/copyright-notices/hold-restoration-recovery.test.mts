import { describe, expect, it } from 'vitest'
import {
  createTestCopyrightDeliveryDependencies,
  type CopyrightTestDeliveryPublisher,
} from '@voucha/test-helpers/copyright-delivery-dependencies'
import { readTestOwnedCopyrightSweepIds } from '@voucha/test-helpers/services/copyright-notices/sweep-ids'
import {
  recordHistoricalTestCopyrightHoldResolution,
  rollbackTestCopyrightHoldResolution,
  replayTestFailedCopyrightActionBehindHoldFence,
  cancelTestCopyrightRestorationDeadline,
  quarantineTestCopyrightRestorationImage,
  makeTestCopyrightRestorationImageUnready,
  retireTestCopyrightRestorationPlacement,
  supersedeTestCopyrightRestorationPlacementRevision,
} from '@voucha/test-helpers/services/copyright-notices/hold-restoration'
import {
  appendCopyrightNoticeSubmission,
  appendCopyrightSubmissionAssessment,
  processCopyrightActionIntent,
  recoverBlockedCopyrightHoldRestorations,
  searchBlockedCopyrightHoldRestorationNoticeIds,
  searchRecoverableCopyrightActionIntentIds,
} from './index.mts'
import { claimCopyrightActionIntent } from './action-delivery-state.mts'
import { failCopyrightActionIntent } from './action-delivery-completion.mts'
import {
  openHeldCounterNoticeRestore,
  recordOrdinaryCopyrightHold,
} from './restoration-hold-scene.mts'
import { createCounterNoticeRestoreIntent } from './evidence-and-holds-restoration-hold-fixtures.mts'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

const publish: CopyrightTestDeliveryPublisher = async () => undefined

async function historicalBlockedRestore(targetCount = 1) {
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

async function recordHistoricalResolution(
  scene: Awaited<ReturnType<typeof historicalBlockedRestore>>,
) {
  await recordHistoricalTestCopyrightHoldResolution({
    assessmentId: scene.hold.id,
    resolvedAt: scene.restorationAt,
    actorId: scene.moderator.id,
  })
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

describe('historical blocked copyright restoration recovery', () => {
  it('reopens the original historical blocked restore once and leaves failed work alone', async () => {
    const scene = await historicalBlockedRestore(2)
    const aggregate = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    const other = aggregate?.targets.find(target => target.id !== scene.target.id)
    const restriction = aggregate?.restrictions.find(
      record => record.copyright_notice_target_id === other?.id,
    )
    if (!other || !restriction) throw new Error('Second restriction fixture disappeared')
    const failed = await createCounterNoticeRestoreIntent({
      claimant: scene.claimant,
      noticeId: scene.notice.id,
      moderator: scene.moderator,
      targetId: other.id,
      restrictionId: restriction.id,
      placementRevision: other.placement_revision,
    })
    await exhaustDelivery(failed.restore.id, failed.now)
    const before = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(before?.actionIntents.find(intent => intent.id === failed.restore.id)).toMatchObject({
      state: 'failed',
      attempt_count: 5,
    })
    await recordHistoricalResolution(scene)
    await expect(
      readTestOwnedCopyrightSweepIds(
        searchBlockedCopyrightHoldRestorationNoticeIds,
        scene.notice.id,
      ),
    ).resolves.toEqual([scene.notice.id])
    await expect(
      recoverBlockedCopyrightHoldRestorations(scene.notice.id, scene.restorationAt),
    ).resolves.toBe(1)
    await expect(
      recoverBlockedCopyrightHoldRestorations(scene.notice.id, scene.restorationAt),
    ).resolves.toBe(0)
    const recovered = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(recovered?.actionIntents.find(intent => intent.id === scene.restore.id)).toMatchObject({
      id: scene.restore.id,
      copyright_restriction_id: scene.restore.copyright_restriction_id,
      copyright_notice_deadline_id: scene.restore.copyright_notice_deadline_id,
      expected_placement_revision: scene.restore.expected_placement_revision,
      action: 'restore',
      state: 'pending',
      attempt_count: 0,
      leased_at: null,
      completed_at: null,
    })
    expect(recovered?.actionIntents.find(intent => intent.id === failed.restore.id)).toEqual(
      before?.actionIntents.find(intent => intent.id === failed.restore.id),
    )
    expect(recovered?.actionIntents.filter(intent => intent.action === 'withhold')).toEqual(
      before?.actionIntents.filter(intent => intent.action === 'withhold'),
    )
    expect(
      recovered?.lifecycleEvents.filter(event => event.change_type === 'copyright_action_replayed'),
    ).toHaveLength(1)
    await expect(
      readTestOwnedCopyrightSweepIds(
        options =>
          searchRecoverableCopyrightActionIntentIds({ ...options, now: scene.restorationAt }),
        scene.restore.id,
      ),
    ).resolves.toEqual([scene.restore.id])
    await expect(
      readTestOwnedCopyrightSweepIds(
        searchBlockedCopyrightHoldRestorationNoticeIds,
        scene.notice.id,
      ),
    ).resolves.toEqual([])
    await expect(
      processCopyrightActionIntent(
        scene.restore.id,
        scene.restorationAt,
        createTestCopyrightDeliveryDependencies(publish),
      ),
    ).resolves.toBe('applied')
  })

  it.each([
    'future',
    'unassessed',
    'unresolved',
    'cancelled',
    'superseded',
    'unsafe',
    'unready',
    'retired',
    'revision',
  ] as const)('retains the original blocked intent when %s prevents replay', async blocker => {
    const scene = await historicalBlockedRestore()
    const aggregate = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    const original = aggregate?.actionIntents.find(intent => intent.id === scene.restore.id)
    if (blocker !== 'unresolved') await recordHistoricalResolution(scene)
    if (blocker === 'unassessed')
      await appendCopyrightNoticeSubmission({
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
    const now =
      blocker === 'future'
        ? new Date(aggregate!.deadlines[0]!.earliest_restoration_at.getTime() - 1)
        : scene.restorationAt
    await expect(recoverBlockedCopyrightHoldRestorations(scene.notice.id, now)).resolves.toBe(0)
    await expect(recoverBlockedCopyrightHoldRestorations(scene.notice.id, now)).resolves.toBe(0)
    const retained = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(retained?.actionIntents.find(intent => intent.id === scene.restore.id)).toEqual(original)
    expect(
      retained?.lifecycleEvents.filter(event => event.change_type === 'copyright_action_replayed'),
    ).toEqual([])
  })

  it('rolls back hold resolution, restoration replay and its audit together', async () => {
    const scene = await historicalBlockedRestore()
    await expect(
      rollbackTestCopyrightHoldResolution({
        currentUser: scene.moderator,
        assessmentId: scene.hold.id,
        resolvedAt: scene.restorationAt,
        resolutionKind: 'dismissed',
        rationale: 'Rollback transaction boundary.',
      }),
    ).resolves.toEqual([scene.restore.id])
    const aggregate = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(aggregate?.holdResolutions).toEqual([])
    expect(aggregate?.actionIntents.find(intent => intent.id === scene.restore.id)?.state).toBe(
      'blocked',
    )
    expect(
      aggregate?.lifecycleEvents.filter(event =>
        ['legal_hold_resolved', 'copyright_action_replayed'].includes(event.change_type),
      ),
    ).toEqual([])
    await expect(
      recoverBlockedCopyrightHoldRestorations(scene.notice.id, scene.restorationAt),
    ).resolves.toBe(0)
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
