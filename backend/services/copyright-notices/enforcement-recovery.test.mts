import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createTestCopyrightFormIntakeReview } from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import { encodeUuidCursorBefore } from '@voucha/test-helpers/modules/pagination/uuid-cursors'
import { createCopyrightFormFixture } from './route-test-fixtures.mts'
import { createCopyrightFormIntake } from './form-intakes.mts'
import { recoverMissingDecisionAssessments } from './enforcement-recovery.mts'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { appendTestCopyrightAssessmentWhileRecoveryWaits } from '@voucha/test-helpers/copyright-recovery-concurrency'

describe('durable copyright decision recovery', () => {
  it('mutates only one page and resumes after the recovered submission without replaying it', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const submissionIds: string[] = []
    const noticeIds: string[] = []
    for (let index = 0; index < 3; index++) {
      const fixture = await createCopyrightFormFixture()
      const { intake } = await createCopyrightFormIntake({
        currentUser: fixture.claimant,
        requesterIdentity: `user:${fixture.claimant.id}`,
        idempotencyKey: crypto.randomUUID(),
        request: {
          jurisdiction: 'us_dmca',
          claimantDisplayName: fixture.form.claimant_display_name,
          claimantContact: fixture.form.claimant_contact,
          claimantEmail: fixture.form.claimant_email,
          workDescription: fixture.form.work_description,
          goodFaithBelief: fixture.form.good_faith_belief,
          accuracyAuthorityUnderPenaltyOfPerjury:
            fixture.form.accuracy_authority_under_penalty_of_perjury,
          electronicSignature: fixture.form.electronic_signature,
          claimantTargets: fixture.form.targets.map(target => ({
            postId: target.post_id,
            imageId: target.image_id,
            hostedUseUrl: target.target_url,
          })),
        },
      })
      await createTestCopyrightFormIntakeReview({
        intakeId: intake.id,
        moderatorId: moderator.id,
        accepted: true,
      })
      submissionIds.push(intake.copyright_notice_submission_id)
      noticeIds.push(intake.copyright_notice_id)
    }
    await appendTestCopyrightAssessmentWhileRecoveryWaits(
      {
        submissionId: submissionIds[2]!,
        assessedAt: new Date(),
        currentUser: moderator,
        substantiallyCompliant: true,
      },
      () =>
        recoverMissingDecisionAssessments({
          limit: 1,
          after: encodeUuidCursorBefore(submissionIds[2]!),
        }),
    )
    const concurrent = await Promise.all(
      Array.from({ length: 2 }, () =>
        recoverMissingDecisionAssessments({
          limit: 1,
          after: encodeUuidCursorBefore(submissionIds[0]!),
        }),
      ),
    )
    const first = concurrent.find(page => page.results[0] === submissionIds[0])!
    expect(first.results).toEqual([submissionIds[0]])
    expect(first.page_info.has_next_page).toBe(true)
    const second = await recoverMissingDecisionAssessments({
      limit: 1,
      after: first.page_info.end_cursor!,
    })
    expect(second.results).toEqual([submissionIds[1]])
    const replay = await recoverMissingDecisionAssessments({
      limit: 1,
      after: encodeUuidCursorBefore(submissionIds[0]!),
    })
    expect(replay.results).not.toContain(submissionIds[0])
    expect(replay.results).not.toContain(submissionIds[1])
    for (const noticeId of noticeIds) {
      const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
      expect(aggregate?.assessments).toHaveLength(1)
      expect(
        aggregate?.lifecycleEvents.filter(event => event.event_type === 'submission_assessed'),
      ).toHaveLength(1)
    }
  })
})
