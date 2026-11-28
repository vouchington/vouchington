import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  attachApprovedCopyrightEmailRootToNotice,
  createCommittedCopyrightEmailRoot,
} from '@voucha/test-helpers/copyright-email-committed-intake'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { createTestCopyrightFormIntakeReview } from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import { encodeUuidCursorBefore } from '@voucha/test-helpers/modules/pagination/uuid-cursors'
import { createCopyrightFormFixture } from '@voucha/test-helpers/copyright-route-fixtures'
import { createCopyrightFormIntake } from './form-intakes.mts'
import { recoverMissingDecisionAssessments } from './enforcement-recovery.mts'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { appendTestCopyrightAssessmentWhileRecoveryWaits } from '@voucha/test-helpers/copyright-recovery-concurrency'

describe('durable copyright decision recovery', () => {
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
    await appendTestCopyrightAssessmentWhileRecoveryWaits(
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

  it('recovers identical assessments across multi-page and single-page walks with both union arms and multi-submission notices', async () => {
    const [formModerator, emailModerator] = await Promise.all([
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ extraRoles: ['moderator'] }),
    ])

    async function createMixedCohort() {
      const createFormSubmission = async () => {
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
          moderatorId: formModerator.id,
          is_accepted: true,
        })
        return {
          noticeId: intake.copyright_notice_id,
          submissionId: intake.copyright_notice_submission_id,
        }
      }

      const formOnly = await createFormSubmission()
      const dualArm = await createFormSubmission()
      await attachApprovedCopyrightEmailRootToNotice(dualArm.noticeId, emailModerator.id)

      const emailCase = await createCommittedCopyrightEmailRoot(emailModerator.id)
      const emailInitial = await appendTestCopyrightNoticeSubmission({
        noticeId: emailCase.noticeId,
        kind: 'notice',
        receivedAt: new Date(),
        sourceKind: 'email',
        submittedByUserId: null,
        bodyCiphertext: `email-notice-${crypto.randomUUID()}`,
      })
      const emailStaffNotice = await appendTestCopyrightNoticeSubmission({
        noticeId: emailCase.noticeId,
        kind: 'notice',
        receivedAt: new Date(),
        sourceKind: 'staff',
        submittedByUserId: emailModerator.id,
        bodyCiphertext: `staff-notice-${crypto.randomUUID()}`,
      })

      const submissionIds = [
        formOnly.submissionId,
        dualArm.submissionId,
        emailInitial.id,
        emailStaffNotice.id,
      ].toSorted()
      return {
        submissionIds,
        formOnly,
        dualArm,
        emailCase: {
          noticeId: emailCase.noticeId,
          submissionIds: [emailInitial.id, emailStaffNotice.id].toSorted(),
        },
      }
    }

    const [multiCohort, singleCohort] = await Promise.all([
      createMixedCohort(),
      createMixedCohort(),
    ])

    const multiRecovered: string[] = []
    let cursor: string | undefined = encodeUuidCursorBefore(multiCohort.submissionIds[0]!)
    let pageCount = 0
    while (true) {
      const page = await recoverMissingDecisionAssessments({
        ids: multiCohort.submissionIds,
        limit: 1,
        after: cursor,
      })
      pageCount += 1
      multiRecovered.push(...page.results)
      if (!page.page_info.has_next_page) break
      cursor = page.page_info.end_cursor ?? undefined
    }

    const singlePage = await recoverMissingDecisionAssessments({
      ids: singleCohort.submissionIds,
      limit: 100,
      after: encodeUuidCursorBefore(singleCohort.submissionIds[0]!),
    })

    expect(pageCount).toBe(4)
    expect(multiRecovered).toEqual(multiCohort.submissionIds)
    expect(singlePage.results).toEqual(singleCohort.submissionIds)
    expect(singlePage.page_info.has_next_page).toBe(false)

    const [
      multiFormAgg,
      singleFormAgg,
      multiDualAgg,
      singleDualAgg,
      multiEmailAgg,
      singleEmailAgg,
    ] = await Promise.all([
      getCopyrightNoticePrivateAggregate(multiCohort.formOnly.noticeId),
      getCopyrightNoticePrivateAggregate(singleCohort.formOnly.noticeId),
      getCopyrightNoticePrivateAggregate(multiCohort.dualArm.noticeId),
      getCopyrightNoticePrivateAggregate(singleCohort.dualArm.noticeId),
      getCopyrightNoticePrivateAggregate(multiCohort.emailCase.noticeId),
      getCopyrightNoticePrivateAggregate(singleCohort.emailCase.noticeId),
    ])

    expect(multiFormAgg?.assessments.map(a => a.assessed_by_id)).toEqual([formModerator.id])
    expect(singleFormAgg?.assessments.map(a => a.assessed_by_id)).toEqual([formModerator.id])
    // Both arms match dualArm.submissionId; email review (priority 2) wins over form review (priority 1).
    expect(multiDualAgg?.assessments.map(a => a.assessed_by_id)).toEqual([emailModerator.id])
    expect(singleDualAgg?.assessments.map(a => a.assessed_by_id)).toEqual([emailModerator.id])
    expect(multiEmailAgg?.assessments.map(a => a.assessed_by_id)).toEqual([
      emailModerator.id,
      emailModerator.id,
    ])
    expect(singleEmailAgg?.assessments.map(a => a.assessed_by_id)).toEqual([
      emailModerator.id,
      emailModerator.id,
    ])
  })
})
