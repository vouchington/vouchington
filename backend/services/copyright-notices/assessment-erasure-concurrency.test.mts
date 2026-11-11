import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import {
  createCopyrightNoticeForManualAssociation,
  markTestCopyrightNoticeErasedAndCommit,
} from '@voucha/test-helpers/copyright-email-manual-association'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { createMcpCopyrightFormIntake } from '@voucha/test-helpers/copyright-mcp-write-fixtures'
import { createTestCopyrightFormIntakeReview } from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import {
  appendCopyrightAssessmentAfterErasure,
  recoverCopyrightAssessmentAfterErasure,
} from '@voucha/test-helpers/copyright-assessment-erasure-race'
import { recoverMissingDecisionAssessments } from './enforcement-recovery.mts'
import {
  recoverRejectedCopyrightFormReviewEffect,
  searchRecoverableCopyrightFormReviewIntakeIds,
} from './form-reviews-recovery.mts'

describe('copyright assessment and case erasure', () => {
  it('rolls back an assessment if erasure commits before its existing lifecycle clock write', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const noticeId = await createCopyrightNoticeForManualAssociation()
    const submission = await appendTestCopyrightNoticeSubmission({
      noticeId,
      kind: 'notice',
      sourceKind: 'staff',
      receivedAt: new Date(),
      submittedByUserId: null,
      bodyCiphertext: 'owned-assessment-source',
    })
    await expect(
      appendCopyrightAssessmentAfterErasure(
        {
          submissionId: submission.id,
          currentUser: moderator,
          substantiallyCompliant: true,
          assessedAt: new Date(),
        },
        noticeId,
      ),
    ).rejects.toMatchObject({ status: 410 })
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(aggregate?.assessments).toEqual([])
    expect(
      aggregate?.lifecycleEvents.filter(event => event.change_type === 'submission_assessed'),
    ).toEqual([])
  })

  it('rolls back a raced recovery page and excludes the erased case from later sweeps', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const { intake } = await createMcpCopyrightFormIntake()
    await createTestCopyrightFormIntakeReview({
      intakeId: intake.id,
      moderatorId: moderator.id,
      is_accepted: true,
    })
    await expect(
      recoverCopyrightAssessmentAfterErasure(
        intake.copyright_notice_submission_id,
        intake.copyright_notice_id,
      ),
    ).rejects.toMatchObject({ status: 410 })
    const aggregate = await getCopyrightNoticePrivateAggregate(intake.copyright_notice_id)
    expect(aggregate?.assessments).toEqual([])
    expect(
      aggregate?.lifecycleEvents.filter(event => event.change_type === 'submission_assessed'),
    ).toEqual([])
    expect(
      (await recoverMissingDecisionAssessments({ ids: [intake.copyright_notice_submission_id] }))
        .results,
    ).toEqual([])
  })

  it.each([true, false])(
    'does not recover a durable %s review into an erased case',
    async accepted => {
      const moderator = await createTestUser({ extraRoles: ['moderator'] })
      const { intake } = await createMcpCopyrightFormIntake()
      await createTestCopyrightFormIntakeReview({
        intakeId: intake.id,
        moderatorId: moderator.id,
        is_accepted: accepted,
      })
      await markTestCopyrightNoticeErasedAndCommit(intake.copyright_notice_id)
      const page = accepted
        ? await recoverMissingDecisionAssessments({ ids: [intake.copyright_notice_submission_id] })
        : await searchRecoverableCopyrightFormReviewIntakeIds({ ids: [intake.id] })
      expect(page.results).toEqual([])
      if (!accepted) await recoverRejectedCopyrightFormReviewEffect(intake.id)
      expect(
        (await getCopyrightNoticePrivateAggregate(intake.copyright_notice_id))?.assessments,
      ).toEqual([])
    },
  )
})
