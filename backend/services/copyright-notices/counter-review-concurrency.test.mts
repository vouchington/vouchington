import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createCopyrightNoticeForManualAssociation } from '@voucha/test-helpers/copyright-email-manual-association'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { appendTestCopyrightAssessmentWhileRecoveryWaits } from '@voucha/test-helpers/copyright-recovery-concurrency'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { reviewCopyrightCounterNotice } from './counter-notice-reviews.mts'

describe('normal assessment and counter-notice review concurrency', () => {
  it('commits both assessments and publishes the later counter-review result', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const noticeId = await createCopyrightNoticeForManualAssociation()
    const submission = await appendTestCopyrightNoticeSubmission({
      noticeId,
      kind: 'counter_notice',
      sourceKind: 'staff',
      submittedByUserId: null,
      receivedAt: new Date(),
      bodyCiphertext: 'Owned counter-notice.',
    })
    const review = await appendTestCopyrightAssessmentWhileRecoveryWaits(
      {
        submissionId: submission.id,
        currentUser: moderator,
        substantiallyCompliant: false,
        assessedAt: new Date(),
      },
      () =>
        reviewCopyrightCounterNotice({
          currentUser: moderator,
          submissionId: submission.id,
          is_accepted: false,
          rationale: 'Missing statutory declarations.',
        }),
      'reviewCopyrightCounterNotice:submission',
    )
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(
      aggregate?.assessments.filter(row => row.copyright_notice_submission_id === submission.id),
    ).toHaveLength(2)
    expect(aggregate?.submissions.find(row => row.id === submission.id)).toMatchObject({
      current_assessment_identity_id: review.assessmentId,
      current_assessment_is_substantially_compliant: false,
    })
    expect(aggregate?.counterNoticeReviews).toHaveLength(1)
    expect(
      aggregate?.lifecycleEvents.filter(row => row.change_type === 'submission_assessed'),
    ).toHaveLength(1)
    expect(
      aggregate?.lifecycleEvents.filter(row => row.change_type === 'counter_notice_reviewed'),
    ).toHaveLength(1)
  })
})
