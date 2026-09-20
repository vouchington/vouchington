import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightSubmissionAssessment,
  completeCopyrightMandatoryHumanReview,
  createCopyrightDeliveryIntent,
  createCopyrightCounterNotice,
  createCopyrightNoticeAggregate,
  createCounterNoticeDeadline,
  createEligibleCopyrightRestoreIntent,
  createOutboundCopyrightCorrespondence,
  getCopyrightNoticePrivateAggregate,
} from './index.mts'

async function createFixture() {
  const [claimant, moderatorRecord] = await Promise.all([
    createTestUserDirect(),
    createTestUserDirect(),
  ])
  const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
  const postId = await insertTestPost({
    title: `copyright persistence ${crypto.randomUUID()}`,
    slug: `copyright-persistence-${crypto.randomUUID()}`,
    createdById: claimant.id,
    markdown: 'image',
  })
  const imageId = await insertTestImage(claimant.id)
  await insertTestPostImage({ postId, imageId })
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-06-30T16:00:00.000Z'),
    claimantUserId: claimant.id,
    claimantDisplayName: 'private snapshot',
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'signed_in_form',
      bodyCiphertext: `notice-${crypto.randomUUID()}`,
    },
    targets: [
      {
        placementKey: `post-image:${postId}:${imageId}`,
        placementRevision: 1,
        imageId,
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('fixture notice disappeared')
  const correspondence = await createOutboundCopyrightCorrespondence({
    noticeId: notice.id,
    submissionId: aggregate.submissions[0].id,
    correspondenceKind: 'receipt',
    compositionKind: 'deterministic_template',
    bodyCiphertext: `receipt-${crypto.randomUUID()}`,
    draftedById: null,
  })
  await createCopyrightDeliveryIntent({
    noticeId: notice.id,
    submissionId: aggregate.submissions[0].id,
    correspondenceId: correspondence.id,
    recipientUserId: null,
    recipientRole: 'claimant',
    deliveryKind: 'claimant_receipt',
    channel: 'email',
    idempotencyKey: `copyright-claimant-receipt-${crypto.randomUUID()}`,
    recipientEmail: `tests+copyright-${crypto.randomUUID()}@voucha.ai`,
  })
  const noticeAssessment = await appendCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0].id,
    assessedAt: new Date('2026-07-01T11:00:00.000Z'),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  return { aggregate, claimant, moderator, notice, noticeAssessment }
}
describe('copyright notice persistence', () => {
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
        blockers: [],
      }),
    ).rejects.toThrow('Copyright restoration is not eligible')
    await completeCopyrightMandatoryHumanReview({
      noticeId: notice.id,
      restrictionId: restriction.id,
      currentUser: moderator,
      action: 'confirm',
      reviewedAt: new Date('2026-07-02T12:00:00.000Z'),
    })
    const intent = await createEligibleCopyrightRestoreIntent({
      noticeId: notice.id,
      targetId: target.id,
      restrictionId: restriction.id,
      deadlineId: deadline.id,
      expectedPlacementRevision: target.placement_revision,
      now: new Date(deadline.earliest_restoration_at.getTime() + 86_400_000),
      blockers: [],
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
        blockers: [],
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
