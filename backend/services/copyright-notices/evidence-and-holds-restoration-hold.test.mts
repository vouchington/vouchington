import { describe, expect, it, vi } from 'vitest'
import type { publishImagePlacementDeliveryRecord } from '@services/media-delivery-safety'
import { getImagePlacementForCopyright } from '@services/images/placements'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightLegalHoldAssessment,
  appendCopyrightNoticeSubmission,
  appendCopyrightSubmissionAssessment,
  createCopyrightCounterNotice,
  createCounterNoticeDeadline,
  createEligibleCopyrightRestoreIntent,
  getCopyrightNoticePrivateAggregate,
  processCopyrightActionIntent,
  resolveCopyrightLegalHold,
} from './index.mts'
import { createCopyrightRestorationHoldFixture } from './evidence-and-holds-restoration-hold-fixtures.mts'

describe('copyright notice restoration holds', () => {
  it('re-restricts an exact restored tuple for a hold received before restoration, then restores only after resolution', async () => {
    const {
      aggregate,
      assessment: noticeAssessment,
      claimant,
      moderator,
      notice,
    } = await createCopyrightRestorationHoldFixture()
    const target = aggregate.targets[0]!
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: noticeAssessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: moderator.id,
    })
    const initialWithhold = (
      await getCopyrightNoticePrivateAggregate(notice.id)
    )?.actionIntents.find(intent => intent.action === 'withhold')
    if (!initialWithhold) throw new Error('initial withhold intent disappeared')
    const publish = vi.fn<typeof publishImagePlacementDeliveryRecord>().mockResolvedValue(undefined)
    await expect(
      processCopyrightActionIntent(initialWithhold.id, new Date('2026-07-01T12:01:00.000Z'), {
        publishImagePlacementDeliveryRecord: publish,
      }),
    ).resolves.toBe('applied')
    const counterNotice = await createCopyrightCounterNotice(
      claimant,
      notice.id,
      crypto.randomUUID(),
      {
        name: 'Poster',
        address: '1 Main Street',
        telephone: '555-0100',
        consentToFederalJurisdiction: true,
        consentToServiceOfProcess: true,
        goodFaithMisidentificationUnderPenaltyOfPerjury: true,
        electronicSignature: 'Poster',
        targetIds: [target.id],
      },
    )
    const counterAssessment = await appendCopyrightSubmissionAssessment({
      submissionId: counterNotice.submission.id,
      assessedAt: new Date('2026-07-02T12:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
      targetIds: [target.id],
    })
    const deadline = await createCounterNoticeDeadline({ assessmentId: counterAssessment.id })
    const restorationAt = new Date(deadline.earliest_restoration_at.getTime() + 60_000)
    const restore = await createEligibleCopyrightRestoreIntent({
      noticeId: notice.id,
      targetId: target.id,
      restrictionId: restriction.id,
      deadlineId: deadline.id,
      expectedPlacementRevision: target.placement_revision,
      now: restorationAt,
    })
    await expect(
      processCopyrightActionIntent(restore.id, restorationAt, {
        publishImagePlacementDeliveryRecord: publish,
      }),
    ).resolves.toBe('applied')
    const holdSubmission = await appendCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date('2026-07-03T12:00:00.000Z'),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `hold-${crypto.randomUUID()}`,
    })
    const hold = await appendCopyrightLegalHoldAssessment({
      currentUser: moderator,
      submissionId: holdSubmission.id,
      assessedAt: new Date(restorationAt.getTime() + 60_000),
      fromOriginalClaimant: true,
      proceedingKind: 'federal_court',
      ccbClaimKind: null,
      commencedAt: new Date('2026-07-03T11:00:00.000Z'),
      receivedByDesignatedAgentAt: new Date('2026-07-03T12:00:00.000Z'),
      sameMaterial: true,
      targetIds: [target.id],
      rationale: 'Verified qualifying federal court filing.',
      dependencies: {
        assertLegalEnforcementEnabled: () => {},
        publishPlacement: publish,
      },
    })
    const holdWithhold = (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
      intent => intent.action === 'withhold' && intent.id !== initialWithhold.id,
    )
    await expect(getImagePlacementForCopyright(target.placement_key)).resolves.toEqual(
      expect.objectContaining({
        placementId: target.placement_key.replace('image-placement:', ''),
        revision: target.placement_revision + 3,
        withheld: true,
      }),
    )
    expect(holdWithhold).toEqual(
      expect.objectContaining({
        expected_placement_revision: target.placement_revision + 2,
        state: 'pending',
      }),
    )
    if (!holdWithhold) throw new Error('hold withhold intent disappeared')
    await expect(
      processCopyrightActionIntent(holdWithhold.id, new Date(restorationAt.getTime() + 120_000), {
        publishImagePlacementDeliveryRecord: publish,
      }),
    ).resolves.toBe('applied')
    await resolveCopyrightLegalHold({
      currentUser: moderator,
      assessmentId: hold.id,
      resolvedAt: new Date(restorationAt.getTime() + 180_000),
      resolutionKind: 'dismissed',
      rationale: `resolution-${crypto.randomUUID()}`,
    })
    const holdRestore = (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
      intent => intent.action === 'restore' && intent.copyright_restriction_id !== restriction.id,
    )
    expect(holdRestore).toEqual(expect.objectContaining({ state: 'pending' }))
    if (!holdRestore) throw new Error('hold restore intent disappeared')
    await expect(
      processCopyrightActionIntent(holdRestore.id, new Date(restorationAt.getTime() + 240_000), {
        publishImagePlacementDeliveryRecord: publish,
      }),
    ).resolves.toBe('applied')
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'allow' }))

    const beforeLateReceipt = await getCopyrightNoticePrivateAggregate(notice.id)
    const lateSubmission = await appendCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date(restorationAt.getTime() + 300_000),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `late-hold-${crypto.randomUUID()}`,
    })
    await appendCopyrightLegalHoldAssessment({
      currentUser: moderator,
      submissionId: lateSubmission.id,
      assessedAt: new Date(restorationAt.getTime() + 360_000),
      fromOriginalClaimant: true,
      proceedingKind: 'federal_court',
      ccbClaimKind: null,
      commencedAt: new Date(restorationAt.getTime() + 299_000),
      receivedByDesignatedAgentAt: new Date(restorationAt.getTime() + 300_000),
      sameMaterial: true,
      targetIds: [target.id],
      rationale: 'Receipt was outside the statutory hold window.',
      dependencies: {
        assertLegalEnforcementEnabled: () => {},
        publishPlacement: publish,
      },
    })
    const afterLateReceipt = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(afterLateReceipt?.actionIntents).toHaveLength(
      beforeLateReceipt?.actionIntents.length ?? 0,
    )
  })

  it('rolls back a rejected late-hold target without staging a denial or action intent', async () => {
    const { moderator, notice } = await createCopyrightRestorationHoldFixture()
    const submission = await appendCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date('2026-07-03T12:00:00.000Z'),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `invalid-hold-${crypto.randomUUID()}`,
    })

    await expect(
      appendCopyrightLegalHoldAssessment({
        currentUser: moderator,
        submissionId: submission.id,
        assessedAt: new Date('2026-07-03T12:01:00.000Z'),
        fromOriginalClaimant: true,
        proceedingKind: 'federal_court',
        ccbClaimKind: null,
        commencedAt: new Date('2026-07-03T11:00:00.000Z'),
        receivedByDesignatedAgentAt: new Date('2026-07-03T12:00:00.000Z'),
        sameMaterial: true,
        targetIds: [crypto.randomUUID()],
        rationale: 'Target must belong to this notice.',
      }),
    ).rejects.toMatchObject({ statusCode: 422 })

    const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(aggregate?.holdAssessments).toEqual([])
    expect(aggregate?.actionIntents).toEqual([])
  })
})
