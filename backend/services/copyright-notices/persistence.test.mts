import { createAssessedUsDmcaCopyrightNoticeFixture } from '@voucha/test-helpers/copyright-us-dmca-notice-fixture'
import { describe, expect, it, vi } from 'vitest'
import {
  completeCopyrightMandatoryHumanReview,
  createCopyrightCounterNotice,
  enforceCopyrightAssessment,
} from './index.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'
import { createEligibleCopyrightRestoreIntent } from './restoration.mts'
import { acceptCounterNoticeForRestoration } from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

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
  it('recovers an owed restriction after a post-assessment failure', async () => {
    const { notice, noticeAssessment } = await createFixture()
    const interrupted = vi
      .fn<typeof acceptCopyrightNoticeAndImposeRestriction>()
      .mockRejectedValueOnce(new Error('simulated worker interruption'))

    await expect(
      enforceCopyrightAssessment(noticeAssessment.id, { imposeRestriction: interrupted }),
    ).rejects.toThrow('simulated worker interruption')
    await expect(getCopyrightNoticePrivateAggregate(notice.id)).resolves.toEqual(
      expect.objectContaining({
        notice: expect.objectContaining({ accepted_at: null }),
        restrictions: [],
      }),
    )

    await enforceCopyrightAssessment(noticeAssessment.id)
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
    const { deadline } = await acceptCounterNoticeForRestoration({
      noticeId: notice.id,
      submissionId: submission.submission.id,
      moderator,
    })

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
    const { deadline } = await acceptCounterNoticeForRestoration({
      noticeId: notice.id,
      submissionId: submission.submission.id,
      moderator,
    })

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
  it('cancels the qualifying deadline when a compliance assessment is corrected', async () => {
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
    const { assessmentId, deadline } = await acceptCounterNoticeForRestoration({
      noticeId: notice.id,
      submissionId: submission.submission.id,
      moderator,
    })
    const correction = await appendCopyrightSubmissionAssessment({
      submissionId: submission.submission.id,
      assessedAt: new Date(),
      currentUser: moderator,
      substantiallyCompliant: false,
      supersedesAssessmentId: assessmentId,
    })

    await expect(
      appendCopyrightSubmissionAssessment({
        submissionId: submission.submission.id,
        assessedAt: new Date(),
        currentUser: moderator,
        substantiallyCompliant: false,
        supersedesAssessmentId: assessmentId,
      }),
    ).rejects.toThrow('Assessment must extend the current assessment tip')
    await expect(
      createEligibleCopyrightRestoreIntent({
        noticeId: notice.id,
        targetId: target.id,
        restrictionId: restriction.id,
        deadlineId: deadline.id,
        expectedPlacementRevision: target.placement_revision,
        now: new Date(deadline.earliest_restoration_at.getTime() + 86_400_000),
      }),
    ).rejects.toThrow('Copyright notice restoration record not found')
    const refreshedAggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(refreshedAggregate?.deadlines).toEqual([
      expect.objectContaining({ id: deadline.id, cancelled_at: expect.any(Date) }),
    ])
    expect(refreshedAggregate?.assessments).toContainEqual(
      expect.objectContaining({ id: correction.id, is_substantially_compliant: false }),
    )
  })
})
