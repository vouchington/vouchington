import { describe, expect, it } from 'vitest'
import {
  createTestCopyrightDeliveryDependencies,
  type CopyrightTestDeliveryPublisher,
} from '@voucha/test-helpers/copyright-delivery-dependencies'
import { getImagePlacementForCopyright } from '@services/images/placements'
import {
  appendCopyrightLegalHoldAssessment,
  appendCopyrightNoticeSubmission,
  appendCopyrightSubmissionAssessment,
  getCopyrightNoticePrivateAggregate,
  processCopyrightActionIntent,
  resolveCopyrightLegalHold,
} from './index.mts'
import {
  openHeldCounterNoticeRestore,
  recordOrdinaryCopyrightHold as recordHold,
} from './restoration-hold-scene.mts'

describe('ordinary copyright hold restoration', () => {
  it('reopens the original statutory restore only after both ordinary holds resolve', async () => {
    const publish: CopyrightTestDeliveryPublisher = async () => undefined
    const scene = await openHeldCounterNoticeRestore(
      createTestCopyrightDeliveryDependencies(publish),
    )
    const firstHold = await recordHold(
      scene,
      createTestCopyrightDeliveryDependencies(publish).prepublishImagePlacementDenial,
    )
    const secondHold = await recordHold(
      scene,
      createTestCopyrightDeliveryDependencies(publish).prepublishImagePlacementDenial,
    )
    const deps = createTestCopyrightDeliveryDependencies(publish)
    await expect(
      processCopyrightActionIntent(scene.restore.id, scene.restorationAt, deps),
    ).resolves.toBe('blocked')

    await resolveCopyrightLegalHold({
      currentUser: scene.moderator,
      assessmentId: firstHold.id,
      resolvedAt: scene.restorationAt,
      resolutionKind: 'dismissed',
      rationale: 'First proceeding ended.',
    })
    const partlyResolved = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(
      partlyResolved?.actionIntents.find(intent => intent.id === scene.restore.id)?.state,
    ).toBe('blocked')
    await expect(getImagePlacementForCopyright(scene.target.placement_key)).resolves.toEqual(
      expect.objectContaining({ withheld: true }),
    )

    await resolveCopyrightLegalHold({
      currentUser: scene.moderator,
      assessmentId: secondHold.id,
      resolvedAt: scene.restorationAt,
      resolutionKind: 'dismissed',
      rationale: 'Final proceeding ended.',
    })
    const resolved = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(resolved?.actionIntents.filter(intent => intent.action === 'restore')).toEqual([
      expect.objectContaining({
        id: scene.restore.id,
        copyright_restriction_id: scene.restore.copyright_restriction_id,
        copyright_notice_deadline_id: scene.restore.copyright_notice_deadline_id,
        expected_placement_revision: scene.restore.expected_placement_revision,
        state: 'pending',
      }),
    ])
    expect(resolved?.restrictions).toHaveLength(1)
    expect(resolved?.deadlines).toHaveLength(1)
    expect(
      resolved?.lifecycleEvents.filter(event => event.event_type === 'copyright_action_replayed'),
    ).toHaveLength(1)
    await expect(
      processCopyrightActionIntent(scene.restore.id, scene.restorationAt, deps),
    ).resolves.toBe('applied')
    await expect(getImagePlacementForCopyright(scene.target.placement_key)).resolves.toEqual(
      expect.objectContaining({ withheld: false }),
    )
  })

  it('restores only the counter-noticed target in a two-target case', async () => {
    const publish: CopyrightTestDeliveryPublisher = async () => undefined
    const scene = await openHeldCounterNoticeRestore(
      createTestCopyrightDeliveryDependencies(publish),
      2,
    )
    const aggregate = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    const otherTarget = aggregate?.targets.find(target => target.id !== scene.target.id)
    const otherWithhold = aggregate?.actionIntents.find(
      intent => intent.action === 'withhold' && intent.id !== scene.initialWithhold.id,
    )
    if (!otherTarget || !otherWithhold) throw new Error('Second target fixture disappeared')
    const deps = createTestCopyrightDeliveryDependencies(publish)
    await expect(
      processCopyrightActionIntent(otherWithhold.id, scene.restorationAt, deps),
    ).resolves.toBe('applied')
    const hold = await recordHold(
      scene,
      createTestCopyrightDeliveryDependencies(publish).prepublishImagePlacementDenial,
      [scene.target.id, otherTarget.id],
    )
    await expect(
      processCopyrightActionIntent(scene.restore.id, scene.restorationAt, deps),
    ).resolves.toBe('blocked')
    await resolveCopyrightLegalHold({
      currentUser: scene.moderator,
      assessmentId: hold.id,
      resolvedAt: scene.restorationAt,
      resolutionKind: 'dismissed',
      rationale: 'Both proceedings ended.',
    })
    await expect(
      processCopyrightActionIntent(scene.restore.id, scene.restorationAt, deps),
    ).resolves.toBe('applied')
    const resolved = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(
      resolved?.actionIntents
        .filter(intent => intent.action === 'restore')
        .map(intent => intent.id),
    ).toEqual([scene.restore.id])
    expect(
      resolved?.restrictions.find(
        restriction => restriction.copyright_notice_target_id === otherTarget.id,
      )?.lifted_at,
    ).toBeNull()
    expect(resolved?.deadlines).toHaveLength(1)
    await expect(getImagePlacementForCopyright(otherTarget.placement_key)).resolves.toEqual(
      expect.objectContaining({ withheld: true }),
    )
    await expect(getImagePlacementForCopyright(scene.target.placement_key)).resolves.toEqual(
      expect.objectContaining({ withheld: false }),
    )
  })

  it.each(['current', 'superseded'] as const)(
    'rechecks %s authority after an already applied restore is interrupted by a filing',
    async authority => {
      const publish: CopyrightTestDeliveryPublisher = async () => undefined
      const scene = await openHeldCounterNoticeRestore(
        createTestCopyrightDeliveryDependencies(publish),
      )
      const failure = new Error('External publication unavailable.')
      const failingPublish: CopyrightTestDeliveryPublisher = async input => {
        if (input.state === 'allow') throw failure
      }
      await expect(
        processCopyrightActionIntent(
          scene.restore.id,
          scene.restorationAt,
          createTestCopyrightDeliveryDependencies(failingPublish),
        ),
      ).rejects.toBe(failure)
      const applied = await getCopyrightNoticePrivateAggregate(scene.notice.id)
      expect(applied?.restrictions[0]?.lifted_at).not.toBeNull()
      expect(applied?.deadlines[0]?.resolved_at).not.toBeNull()
      const filing = await appendCopyrightNoticeSubmission({
        noticeId: scene.notice.id,
        kind: 'court_or_ccb_hold',
        receivedAt: scene.restorationAt,
        sourceKind: 'email',
        submittedByUserId: null,
        bodyCiphertext: `filing-${crypto.randomUUID()}`,
      })
      const retryAt = new Date(scene.restorationAt.getTime() + 120_000)
      await expect(
        processCopyrightActionIntent(
          scene.restore.id,
          retryAt,
          createTestCopyrightDeliveryDependencies(publish),
        ),
      ).resolves.toBe('blocked')
      if (authority === 'superseded') {
        const assessment = applied?.assessments.find(
          record => record.id === applied.deadlines[0]?.qualifying_counter_notice_assessment_id,
        )
        if (!assessment) throw new Error('Original counter-notice assessment disappeared')
        await appendCopyrightSubmissionAssessment({
          submissionId: assessment.copyright_notice_submission_id,
          assessedAt: retryAt,
          currentUser: scene.moderator,
          substantiallyCompliant: false,
          supersedesAssessmentId: assessment.id,
        })
      }
      await appendCopyrightLegalHoldAssessment({
        currentUser: scene.moderator,
        submissionId: filing.id,
        assessedAt: retryAt,
        fromOriginalClaimant: false,
        proceedingKind: null,
        ccbClaimKind: null,
        commencedAt: null,
        receivedByDesignatedAgentAt: null,
        sameMaterial: false,
        targetIds: [scene.target.id],
        rationale: 'No qualifying proceeding exists.',
      })
      const reopened = await getCopyrightNoticePrivateAggregate(scene.notice.id)
      expect(reopened?.actionIntents.find(intent => intent.id === scene.restore.id)).toMatchObject({
        state: authority === 'current' ? 'pending' : 'blocked',
        expected_placement_revision: scene.restore.expected_placement_revision,
        copyright_notice_deadline_id: scene.restore.copyright_notice_deadline_id,
      })
      await expect(
        processCopyrightActionIntent(
          scene.restore.id,
          retryAt,
          createTestCopyrightDeliveryDependencies(publish),
        ),
      ).resolves.toBe(authority === 'current' ? 'applied' : 'not_claimed')
      expect(reopened?.deadlines).toEqual(applied?.deadlines)
    },
  )
})
