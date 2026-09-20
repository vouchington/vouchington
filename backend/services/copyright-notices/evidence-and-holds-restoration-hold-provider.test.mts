import { describe, expect, it, vi } from 'vitest'
import type { publishImagePlacementDeliveryRecord } from '@services/images/delivery-registry'
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
} from './index.mts'
import { createCopyrightRestorationHoldFixture } from './evidence-and-holds-restoration-hold-fixtures.mts'

describe('late legal-hold edge publication', () => {
  it('rolls back every late-hold record when the edge provider rejects the denial', async () => {
    const restored = await restorePlacementForLateHold()
    const before = await getCopyrightNoticePrivateAggregate(restored.noticeId)
    const publish = vi
      .fn<typeof publishImagePlacementDeliveryRecord>()
      .mockRejectedValue(new Error('DynamoDB denied the legal withholding write'))

    await expect(appendLateHold(restored, publish)).rejects.toThrow(
      'DynamoDB denied the legal withholding write',
    )

    const after = await getCopyrightNoticePrivateAggregate(restored.noticeId)
    expect(after?.holdAssessments).toEqual(before?.holdAssessments)
    expect(after?.restrictions).toEqual(before?.restrictions)
    expect(after?.actionIntents).toEqual(before?.actionIntents)
    await expect(getImagePlacementForCopyright(restored.placementKey)).resolves.toEqual(
      expect.objectContaining({ withheld: false }),
    )
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'withheld' }),
      expect.any(Object),
    )
  })

  it('publishes the denial before it makes the restored placement withheld in PostgreSQL', async () => {
    const restored = await restorePlacementForLateHold()
    const withheldStatesAtPublication: boolean[] = []
    const publish = vi
      .fn<typeof publishImagePlacementDeliveryRecord>()
      .mockImplementation(async input => {
        expect(input.state).toBe('withheld')
        const placement = await getImagePlacementForCopyright(restored.placementKey)
        if (!placement) throw new Error('restored placement disappeared')
        withheldStatesAtPublication.push(placement.withheld)
      })

    await appendLateHold(restored, publish)

    expect(withheldStatesAtPublication).toEqual([false])
    await expect(getImagePlacementForCopyright(restored.placementKey)).resolves.toEqual(
      expect.objectContaining({ withheld: true }),
    )
  })
})

async function restorePlacementForLateHold(): Promise<{
  moderator: Awaited<ReturnType<typeof createCopyrightRestorationHoldFixture>>['moderator']
  noticeId: string
  placementKey: string
  restorationAt: Date
  targetId: string
}> {
  const { aggregate, assessment, claimant, moderator, notice } =
    await createCopyrightRestorationHoldFixture()
  const target = aggregate.targets[0]
  if (!target) throw new Error('copyright hold target disappeared')
  const restriction = await acceptCopyrightNoticeAndImposeRestriction({
    noticeId: notice.id,
    targetId: target.id,
    assessmentId: assessment.id,
    imposedAt: new Date('2026-07-01T12:00:00.000Z'),
    imposedById: moderator.id,
  })
  const initialWithhold = (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
    intent => intent.action === 'withhold',
  )
  if (!initialWithhold) throw new Error('initial withhold intent disappeared')
  const publish = vi.fn<typeof publishImagePlacementDeliveryRecord>().mockResolvedValue(undefined)
  await processCopyrightActionIntent(initialWithhold.id, new Date('2026-07-01T12:01:00.000Z'), {
    publishImagePlacementDeliveryRecord: publish,
  })
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
  await processCopyrightActionIntent(restore.id, restorationAt, {
    publishImagePlacementDeliveryRecord: publish,
  })
  return {
    moderator,
    noticeId: notice.id,
    placementKey: target.placement_key,
    restorationAt,
    targetId: target.id,
  }
}

async function appendLateHold(
  restored: Awaited<ReturnType<typeof restorePlacementForLateHold>>,
  publishPlacement: typeof publishImagePlacementDeliveryRecord,
) {
  const submission = await appendCopyrightNoticeSubmission({
    noticeId: restored.noticeId,
    kind: 'court_or_ccb_hold',
    receivedAt: new Date(restored.restorationAt.getTime() - 1),
    sourceKind: 'email',
    submittedByUserId: null,
    bodyCiphertext: `late-hold-${crypto.randomUUID()}`,
  })
  return await appendCopyrightLegalHoldAssessment({
    currentUser: restored.moderator,
    submissionId: submission.id,
    assessedAt: new Date(restored.restorationAt.getTime() + 60_000),
    fromOriginalClaimant: true,
    proceedingKind: 'federal_court',
    ccbClaimKind: null,
    commencedAt: new Date(restored.restorationAt.getTime() - 60_000),
    receivedByDesignatedAgentAt: new Date(restored.restorationAt.getTime() - 1),
    sameMaterial: true,
    targetIds: [restored.targetId],
    rationale: 'Verified qualifying federal court filing before restoration.',
    dependencies: { assertLegalEnforcementEnabled: () => {}, publishPlacement },
  })
}
