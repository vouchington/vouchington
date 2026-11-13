import { assertUnassessedFilingGuard } from '@voucha/test-helpers/copyright-unassessed-filing-outcomes'
import { seedCopyrightStatementRestriction } from '@voucha/test-helpers/copyright-statement-restriction-fixture'
import { seedEffectiveConfirmation } from '@voucha/test-helpers/copyright-effective-review-decisions'
import { assertEvidenceRestoreProbe } from '@voucha/test-helpers/copyright-evidence-restore-outcome'
import {
  assertOwedPersistenceRestriction,
  assertPersistenceCorrection,
  assertPersistenceStaleTip,
} from '@voucha/test-helpers/copyright-persistence-outcomes'
import { seedRestorationCounterApproval } from '@voucha/test-helpers/copyright-restoration-counter-approval-fixture'
import {
  seedCopyrightCounterNotice,
  seedCopyrightSubmissionAssessment,
} from '@voucha/test-helpers/copyright-notice-submissions'
import { createAssessedUsDmcaCopyrightNoticeFixture } from '@voucha/test-helpers/copyright-us-dmca-notice-fixture'
import { describe, expect, it } from 'vitest'
import { interceptCopyrightImpositionForTest } from '@voucha/test-helpers/copyright-imposition-intercept'
import { enforceCopyrightAssessment } from './index.mts'
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
    const { notice, noticeAssessment, aggregate, claimant, moderator } = await createFixture()
    const before = await getCopyrightNoticePrivateAggregate(notice.id)
    interceptCopyrightImpositionForTest(notice.id, async () => {
      throw new Error('simulated worker interruption')
    })

    await expect(enforceCopyrightAssessment(noticeAssessment.id)).rejects.toThrow(
      'simulated worker interruption',
    )
    await expect(getCopyrightNoticePrivateAggregate(notice.id)).resolves.toEqual(before)

    await assertOwedPersistenceRestriction({
      noticeId: notice.id,
      assessmentId: noticeAssessment.id,
      moderatorId: moderator.id,
      posterId: claimant.id,
      targetId: aggregate.targets[0]!.id,
      revision: aggregate.targets[0]!.placement_revision,
    })
  })

  it('derives a deadline from the immutable qualifying counter-notice receipt', async () => {
    const { aggregate, claimant, moderator, notice } = await createFixture()
    const target = aggregate.targets[0]!
    const submission = await seedCopyrightCounterNotice(notice.id, claimant.id, [target.id])
    const { deadline } = await seedRestorationCounterApproval({
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
    expect.hasAssertions()
    const { aggregate, claimant, moderator, notice, noticeAssessment } = await createFixture()
    const target = aggregate.targets[0]
    const restriction = await seedCopyrightStatementRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: noticeAssessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      moderatorId: moderator.id,
      reviewed: false,
      revision: target.placement_revision,
    })
    const submission = await seedCopyrightCounterNotice(notice.id, claimant.id, [target.id])
    const { deadline } = await seedRestorationCounterApproval({
      noticeId: notice.id,
      submissionId: submission.submission.id,
      moderator,
    })

    await assertEvidenceRestoreProbe(
      {
        noticeId: notice.id,
        targetId: target.id,
        restrictionId: restriction.id,
        deadlineId: deadline.id,
        expectedPlacementRevision: target.placement_revision,
        now: new Date(deadline.earliest_restoration_at.getTime() + 1),
      },
      false,
    )
    await seedEffectiveConfirmation(notice.id, restriction.id, moderator)
    await assertEvidenceRestoreProbe(
      {
        noticeId: notice.id,
        targetId: target.id,
        restrictionId: restriction.id,
        deadlineId: deadline.id,
        expectedPlacementRevision: target.placement_revision,
        now: new Date(deadline.earliest_restoration_at.getTime() - 1),
      },
      false,
    )
    await assertEvidenceRestoreProbe(
      {
        noticeId: notice.id,
        targetId: target.id,
        restrictionId: restriction.id,
        deadlineId: deadline.id,
        expectedPlacementRevision: target.placement_revision,
        now: deadline.earliest_restoration_at,
      },
      true,
    )
  })
  it('cancels the qualifying deadline when a compliance assessment is corrected', async () => {
    const { aggregate, claimant, moderator, notice, noticeAssessment } = await createFixture()
    const target = aggregate.targets[0]
    await seedCopyrightStatementRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: noticeAssessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      moderatorId: moderator.id,
      revision: target.placement_revision,
    })
    const submission = await seedCopyrightCounterNotice(notice.id, claimant.id, [target.id])
    const { assessmentId } = await seedRestorationCounterApproval({
      noticeId: notice.id,
      submissionId: submission.submission.id,
      moderator,
    })
    await assertPersistenceCorrection(notice.id, {
      submissionId: submission.submission.id,
      assessedAt: new Date(),
      currentUser: moderator,
      substantiallyCompliant: false,
      supersedesAssessmentId: assessmentId,
    })

    // Stale-tip and cancelled-deadline guards always run against a separately committed correction.
    const committed = await createCorrectedFixture()
    await assertPersistenceStaleTip(committed.notice.id, {
      submissionId: committed.submission.submission.id,
      assessedAt: new Date(),
      currentUser: committed.moderator,
      substantiallyCompliant: false,
      supersedesAssessmentId: committed.assessmentId,
    })
    await assertUnassessedFilingGuard(
      {
        noticeId: committed.notice.id,
        targetId: committed.target.id,
        restrictionId: committed.restriction.id,
        deadlineId: committed.deadline.id,
        expectedPlacementRevision: committed.target.placement_revision,
        now: new Date(committed.deadline.earliest_restoration_at.getTime() + 86_400_000),
      },
      'Copyright notice restoration record not found',
      404,
    )
    const refreshedAggregate = await getCopyrightNoticePrivateAggregate(committed.notice.id)
    expect(refreshedAggregate?.deadlines).toEqual([
      expect.objectContaining({ id: committed.deadline.id, cancelled_at: expect.any(Date) }),
    ])
    expect(refreshedAggregate?.assessments).toContainEqual(
      expect.objectContaining({ id: committed.correction.id, is_substantially_compliant: false }),
    )
  })
})

async function createCorrectedFixture() {
  const fixture = await createFixture()
  const target = fixture.aggregate.targets[0]!
  const restriction = await seedCopyrightStatementRestriction({
    noticeId: fixture.notice.id,
    targetId: target.id,
    assessmentId: fixture.noticeAssessment.id,
    moderatorId: fixture.moderator.id,
    revision: target.placement_revision,
    imposedAt: new Date('2026-07-01T12:00:00.000Z'),
  })
  const submission = await seedCopyrightCounterNotice(fixture.notice.id, fixture.claimant.id, [
    target.id,
  ])
  const { assessmentId, deadline } = await seedRestorationCounterApproval({
    noticeId: fixture.notice.id,
    submissionId: submission.submission.id,
    moderator: fixture.moderator,
  })
  const correction = await seedCopyrightSubmissionAssessment({
    submissionId: submission.submission.id,
    assessedAt: new Date(),
    currentUser: fixture.moderator,
    substantiallyCompliant: false,
    supersedesAssessmentId: assessmentId,
  })
  return { ...fixture, target, restriction, submission, assessmentId, deadline, correction }
}
