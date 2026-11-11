import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createTestCopyrightFormIntakeReview } from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import { encodeUuidCursorBefore } from '@voucha/test-helpers/modules/pagination/uuid-cursors'
import { createCopyrightFormFixture } from '@voucha/test-helpers/copyright-route-fixtures'
import { createCopyrightFormIntake } from './form-intakes.mts'
import { recoverMissingDecisionAssessments } from './enforcement-recovery.mts'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { appendTestCopyrightAssessmentWhileRecoveryWaits } from '@voucha/test-helpers/copyright-recovery-concurrency'
import {
  copyrightEmailMessageId,
  promoteInitialCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

describe('durable copyright decision recovery', () => {
  useCopyrightIntakeEnvironment()
  it('mutates only one page and resumes after the recovered submission without replaying it', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const submissionIds: string[] = []
    const noticeIds: string[] = []
    for (let index = 0; index < 5; index++) {
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
          goodFaithBelief: fixture.form.has_good_faith_belief,
          accuracyAuthorityUnderPenaltyOfPerjury:
            fixture.form.has_accuracy_authority_under_penalty_of_perjury,
          electronicSignature: fixture.form.electronic_signature,
          claimantTargets: fixture.form.targets.map(target => ({
            surfaceKind: 'post-image' as const,
            postId: target.post_id,
            imageId: target.image_id,
            hostedUseUrl: target.target_url,
          })),
        },
      })
      await createTestCopyrightFormIntakeReview({
        intakeId: intake.id,
        moderatorId: moderator.id,
        is_accepted: true,
      })
      submissionIds.push(intake.copyright_notice_submission_id)
      noticeIds.push(intake.copyright_notice_id)
    }
    const emptyScope = await recoverMissingDecisionAssessments({
      ids: [],
      limit: 1,
      after: encodeUuidCursorBefore(submissionIds[0]!),
    })
    expect(emptyScope.results).toEqual([])
    const raced = await appendTestCopyrightAssessmentWhileRecoveryWaits(
      {
        submissionId: submissionIds[4]!,
        assessedAt: new Date(),
        currentUser: moderator,
        substantiallyCompliant: true,
      },
      () =>
        recoverMissingDecisionAssessments({
          limit: 1,
          ids: submissionIds,
          after: encodeUuidCursorBefore(submissionIds[4]!),
        }),
    )
    expect(raced.results).toEqual([])
    expect(raced.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    // Sequential fixtures prove cap/resume independently of concurrent scheduling.
    const first = await recoverMissingDecisionAssessments({
      limit: 1,
      ids: submissionIds,
      after: encodeUuidCursorBefore(submissionIds[0]!),
    })
    expect(first.results).toEqual([submissionIds[0]])
    expect(first.page_info.has_next_page).toBe(true)
    const second = await recoverMissingDecisionAssessments({
      limit: 1,
      ids: submissionIds,
      after: first.page_info.end_cursor!,
    })
    expect(second.results).toEqual([submissionIds[1]])
    const concurrent = await Promise.all(
      Array.from({ length: 2 }, () =>
        recoverMissingDecisionAssessments({
          limit: 1,
          ids: submissionIds,
          after: encodeUuidCursorBefore(submissionIds[2]!),
        }),
      ),
    )
    const recovered = concurrent.flatMap(page => page.results)
    expect(recovered).toContain(submissionIds[2])
    for (const page of concurrent) expect(page.results.length).toBeLessThanOrEqual(1)
    expect(recovered.every(id => [submissionIds[2], submissionIds[3]].includes(id))).toBe(true)
    // The second call may legitimately start after the first commits and consume the next row.
    const remaining = await recoverMissingDecisionAssessments({
      limit: 1,
      ids: submissionIds,
      after: encodeUuidCursorBefore(submissionIds[3]!),
    })
    const expectedRemaining = recovered.includes(submissionIds[3]!) ? [] : [submissionIds[3]]
    expect(remaining.results).toEqual(expectedRemaining)
    const replay = await recoverMissingDecisionAssessments({
      limit: 1,
      ids: submissionIds,
      after: encodeUuidCursorBefore(submissionIds[0]!),
    })
    expect(replay.results).not.toContain(submissionIds[0])
    expect(replay.results).not.toContain(submissionIds[1])
    expect(replay.results).not.toContain(submissionIds[2])
    expect(replay.results).not.toContain(submissionIds[3])
    for (const noticeId of noticeIds) {
      const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
      expect(aggregate?.assessments).toHaveLength(1)
      expect(
        aggregate?.lifecycleEvents.filter(event => event.change_type === 'submission_assessed'),
      ).toHaveLength(1)
    }
  })

  it('owns both actual submissions before case activity when a same-case writer owns the second', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const { noticeId } = await promoteInitialCopyrightEmail({
      moderator,
      messageId: copyrightEmailMessageId(),
    })
    const first = await appendTestCopyrightNoticeSubmission({
      noticeId,
      kind: 'notice',
      sourceKind: 'staff',
      submittedByUserId: null,
      receivedAt: new Date(),
      bodyCiphertext: 'First owned durable notice.',
    })
    const second = await appendTestCopyrightNoticeSubmission({
      noticeId,
      kind: 'notice',
      sourceKind: 'staff',
      submittedByUserId: null,
      receivedAt: new Date(),
      bodyCiphertext: 'Second owned durable notice.',
    })
    const result = await appendTestCopyrightAssessmentWhileRecoveryWaits(
      {
        submissionId: second.id,
        currentUser: moderator,
        substantiallyCompliant: true,
        assessedAt: new Date(),
      },
      () => recoverMissingDecisionAssessments({ ids: [first.id, second.id], limit: 2 }),
    )
    expect(result.results).toEqual([first.id])
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    for (const submission of [first, second]) {
      const assessments = aggregate!.assessments.filter(
        row => row.copyright_notice_submission_id === submission.id,
      )
      expect(assessments).toHaveLength(1)
      expect(aggregate!.submissions.find(row => row.id === submission.id)).toMatchObject({
        current_assessment_identity_id: assessments[0]!.id,
      })
      expect(
        aggregate!.lifecycleEvents.filter(
          event => event.copyright_notice_submission_assessment_identity_id === assessments[0]!.id,
        ),
      ).toHaveLength(1)
    }
  })
})
