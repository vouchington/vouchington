import { createAssessedUsDmcaCopyrightNoticeFixture } from '@voucha/test-helpers/copyright-us-dmca-notice-fixture'
import { describe, expect, it, vi } from 'vitest'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightSubmissionAssessment,
  completeCopyrightMandatoryHumanReview,
  createCopyrightCounterNotice,
  createCounterNoticeDeadline,
  createEligibleCopyrightRestoreIntent,
  getCopyrightNoticePrivateAggregate,
  processCopyrightEnforcementRequest,
} from './index.mts'

async function createFixture() {
  return createAssessedUsDmcaCopyrightNoticeFixture({
    postTitlePrefix: 'copyright persistence',
    postSlugPrefix: 'copyright-persistence',
    postMarkdown: 'image',
    claimantDisplayName: 'private snapshot',
    noticeBodyCiphertext: `notice-${crypto.randomUUID()}`,
    receiptIdempotencyKeyPrefix: 'copyright-claimant-receipt',
    assessBeforeReceipt: false,
  })
}
describe('copyright notice persistence', () => {
  it('recovers a durable enforcement request after a post-assessment failure', async () => {
    const { notice, noticeAssessment } = await createFixture()
    const interrupted = vi
      .fn<typeof acceptCopyrightNoticeAndImposeRestriction>()
      .mockRejectedValueOnce(new Error('simulated worker interruption'))

    await expect(
      processCopyrightEnforcementRequest(noticeAssessment.id, {
        imposeRestriction: interrupted,
      }),
    ).rejects.toThrow('simulated worker interruption')
    await expect(getCopyrightNoticePrivateAggregate(notice.id)).resolves.toEqual(
      expect.objectContaining({
        notice: expect.objectContaining({ accepted_at: null }),
        restrictions: [],
      }),
    )

    await expect(processCopyrightEnforcementRequest(noticeAssessment.id)).resolves.toBe('completed')
    await expect(getCopyrightNoticePrivateAggregate(notice.id)).resolves.toEqual(
      expect.objectContaining({
        notice: expect.objectContaining({ accepted_at: expect.any(Date) }),
        restrictions: [expect.objectContaining({ authorizing_assessment_id: noticeAssessment.id })],
      }),
    )
  })

  it('derives a deadline from the immutable qualifying counter-notice receipt', async () => {
    const { aggregate, claimant, moderator, notice } = await createFixture()
    const submission = await createCopyrightCounterNotice(
      claimant,
      notice.id,
      crypto.randomUUID(),
      {
        name: 'Claimant',
        address: '1 Main Street',
        telephone: '555-0100',
        consentToFederalJurisdiction: true,
        consentToServiceOfProcess: true,
        goodFaithMisidentificationUnderPenaltyOfPerjury: true,
        electronicSignature: 'Claimant',
        targetIds: [aggregate.targets[0].id],
      },
    )
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: submission.submission.id,
      assessedAt: new Date('2026-07-04T16:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
      targetIds: [aggregate.targets[0].id],
    })
    const deadline = await createCounterNoticeDeadline({ assessmentId: assessment.id })

    expect(deadline.earliest_restoration_at.getTime()).toBeGreaterThan(
      submission.submission.received_at.getTime(),
    )
    expect(deadline.escalation_at.getTime()).toBeGreaterThan(
      deadline.earliest_restoration_at.getTime(),
    )
    expect(deadline.restoration_deadline_at.getTime()).toBeGreaterThanOrEqual(
      deadline.escalation_at.getTime(),
    )
  })
  it('requires human review on the specific restriction before a restoration intent', async () => {
    const { aggregate, claimant, moderator, notice, noticeAssessment } = await createFixture()
    const target = aggregate.targets[0]
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: noticeAssessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: null,
    })
    const submission = await createCopyrightCounterNotice(
      claimant,
      notice.id,
      crypto.randomUUID(),
      {
        name: 'Claimant',
        address: '1 Main Street',
        telephone: '555-0100',
        consentToFederalJurisdiction: true,
        consentToServiceOfProcess: true,
        goodFaithMisidentificationUnderPenaltyOfPerjury: true,
        electronicSignature: 'Claimant',
        targetIds: [target.id],
      },
    )
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: submission.submission.id,
      assessedAt: new Date('2026-07-01T12:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
      targetIds: [target.id],
    })
    const deadline = await createCounterNoticeDeadline({ assessmentId: assessment.id })

    await expect(
      createEligibleCopyrightRestoreIntent({
        noticeId: notice.id,
        targetId: target.id,
        restrictionId: restriction.id,
        deadlineId: deadline.id,
        expectedPlacementRevision: target.placement_revision,
        now: new Date('2026-07-16T12:00:00.000Z'),
      }),
    ).rejects.toThrow('Copyright restoration is not eligible')
    await completeCopyrightMandatoryHumanReview({
      noticeId: notice.id,
      restrictionId: restriction.id,
      currentUser: moderator,
      action: 'confirm',
      rationale: 'The restriction remains appropriate after review.',
      reviewedAt: new Date('2026-07-02T12:00:00.000Z'),
    })
    const intent = await createEligibleCopyrightRestoreIntent({
      noticeId: notice.id,
      targetId: target.id,
      restrictionId: restriction.id,
      deadlineId: deadline.id,
      expectedPlacementRevision: target.placement_revision,
      now: new Date(deadline.earliest_restoration_at.getTime() + 86_400_000),
    })
    expect(intent.action).toBe('restore')
  })
  it('cancels every prior deadline when a compliance assessment is corrected', async () => {
    const { aggregate, claimant, moderator, notice, noticeAssessment } = await createFixture()
    const target = aggregate.targets[0]
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: noticeAssessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: moderator.id,
    })
    const submission = await createCopyrightCounterNotice(
      claimant,
      notice.id,
      crypto.randomUUID(),
      {
        name: 'Claimant',
        address: '1 Main Street',
        telephone: '555-0100',
        consentToFederalJurisdiction: true,
        consentToServiceOfProcess: true,
        goodFaithMisidentificationUnderPenaltyOfPerjury: true,
        electronicSignature: 'Claimant',
        targetIds: [target.id],
      },
    )
    const firstAssessment = await appendCopyrightSubmissionAssessment({
      submissionId: submission.submission.id,
      assessedAt: new Date('2026-07-01T12:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
      targetIds: [target.id],
    })
    const staleDeadline = await createCounterNoticeDeadline({ assessmentId: firstAssessment.id })
    const correction = await appendCopyrightSubmissionAssessment({
      submissionId: submission.submission.id,
      assessedAt: new Date('2026-07-02T12:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
      targetIds: [target.id],
      supersedesAssessmentId: firstAssessment.id,
    })

    await expect(
      appendCopyrightSubmissionAssessment({
        submissionId: submission.submission.id,
        assessedAt: new Date('2026-07-03T12:00:00.000Z'),
        currentUser: moderator,
        substantiallyCompliant: false,
        targetIds: [target.id],
        supersedesAssessmentId: firstAssessment.id,
      }),
    ).rejects.toThrow('Assessment must extend the current assessment tip')
    const replacementDeadline = await createCounterNoticeDeadline({ assessmentId: correction.id })
    const finalCorrection = await appendCopyrightSubmissionAssessment({
      submissionId: submission.submission.id,
      assessedAt: new Date('2026-07-04T12:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: false,
      supersedesAssessmentId: correction.id,
    })
    await expect(createCounterNoticeDeadline({ assessmentId: correction.id })).rejects.toThrow(
      'Copyright submission assessment not found',
    )
    await expect(
      createEligibleCopyrightRestoreIntent({
        noticeId: notice.id,
        targetId: target.id,
        restrictionId: restriction.id,
        deadlineId: replacementDeadline.id,
        expectedPlacementRevision: target.placement_revision,
        now: new Date('2026-07-16T12:00:00.000Z'),
      }),
    ).rejects.toThrow('Copyright notice restoration record not found')
    const refreshedAggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(refreshedAggregate?.deadlines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: staleDeadline.id, cancelled_at: expect.any(Date) }),
        expect.objectContaining({ id: replacementDeadline.id, cancelled_at: expect.any(Date) }),
      ]),
    )
    expect(refreshedAggregate?.assessments).toContainEqual(
      expect.objectContaining({ id: finalCorrection.id, substantially_compliant: false }),
    )
  })
})
