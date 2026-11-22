import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { runOverlappingCopyrightFormWriters } from '@voucha/test-helpers/copyright-form-writer-overlap'
import {
  countCopyrightActiveRestrictionsForNotice,
  readCopyrightNoticeTargetIds,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { readTestCopyrightScreeningExecution } from '@voucha/test-helpers/data-stores/psql/copyright-screening-executions'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { createTestCopyrightFormIntakeReview } from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { testCopyrightFormGuidance } from '@voucha/test-helpers/services/copyright-notices/form-guidance'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'
import {
  claimCopyrightFormScreening,
  completeCopyrightFormScreening,
} from './form-screening-executions.mts'
import { recoverRejectedCopyrightFormReviewEffect } from './form-reviews-recovery.mts'
import { reviewCopyrightFormIntake } from './form-reviews.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'

describe('overlapping copyright form writers', () => {
  it('completes a screening while a human-authorized restriction is imposed', async () => {
    const { intake } = await createSignedInCopyrightForm()
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    await createTestCopyrightFormIntakeReview({
      intakeId: intake.id,
      moderatorId: moderator.id,
      is_accepted: true,
    })
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: moderator,
      substantiallyCompliant: true,
    })
    const [targetId] = await readCopyrightNoticeTargetIds(intake.copyright_notice_id)
    const attempt = await claimCopyrightFormScreening(intake.id)
    if (!attempt || !targetId) throw new Error('Missing screening fixture')
    await runOverlappingCopyrightFormWriters({
      intakeId: intake.id,
      holderMarker: 'completeCopyrightFormScreening:lockNotice',
      waiterMarker: 'lockAssessmentForm:fence',
      holder: () =>
        completeCopyrightFormScreening(attempt, {
          intakeId: intake.id,
          inputSha256: Buffer.alloc(32, 1),
          recommendation: 'not_obviously_invalid',
          rationale: 'Completed screening.',
          guidance: testCopyrightFormGuidance,
          promptVersion: 'copyright-form-screening-v2',
          model: 'test-model',
        }),
      waiter: () =>
        acceptCopyrightNoticeAndImposeRestriction({
          noticeId: intake.copyright_notice_id,
          targetId,
          assessmentId: assessment.id,
          imposedAt: new Date(),
          imposedById: moderator.id,
        }),
    })
    await expect(readTestCopyrightScreeningExecution(intake.id)).resolves.toMatchObject({
      state: 'completed',
      copyright_notice_form_screening_id: expect.any(String),
    })
    await expect(
      countCopyrightActiveRestrictionsForNotice(intake.copyright_notice_id),
    ).resolves.toBe(1)
  })

  it('replays a rejected review while recovery restores its durable effects', async () => {
    const { intake } = await createSignedInCopyrightForm()
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    await createTestCopyrightFormIntakeReview({
      intakeId: intake.id,
      moderatorId: moderator.id,
      is_accepted: false,
    })
    await runOverlappingCopyrightFormWriters({
      intakeId: intake.id,
      holderMarker: 'recoverRejectedCopyrightFormReviewEffect:state',
      waiterMarker: 'reviewCopyrightFormIntake:lock',
      holder: () => recoverRejectedCopyrightFormReviewEffect(intake.id),
      waiter: () =>
        reviewCopyrightFormIntake({
          intakeId: intake.id,
          currentUser: moderator,
          is_accepted: false,
          rationale: 'Replay of the rejected review.',
        }),
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(intake.copyright_notice_id)
    expect(aggregate?.assessments).toEqual([
      expect.objectContaining({ assessed_by_id: moderator.id, is_substantially_compliant: false }),
    ])
  })
})
