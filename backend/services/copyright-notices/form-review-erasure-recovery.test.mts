import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  createTestCopyrightFormRejectionByErasedModerator,
  readTestCopyrightEnforcementRequestState,
  readTestCopyrightFormReviewActor,
} from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import { readTestOwnedCopyrightSweepIds } from '@voucha/test-helpers/services/copyright-notices/sweep-ids'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightSubmissionAssessment,
  createCopyrightFormIntake,
  getCopyrightNoticePrivateAggregate,
  processCopyrightEnforcementRequest,
  recoverRejectedCopyrightFormReviewEffect,
  searchRecoverableCopyrightFormReviewIntakeIds,
} from './index.mts'
import { appendCopyrightFormScreening } from './form-screenings.mts'

async function createAutomatedCopyrightForm() {
  const claimant = await createTestUser()
  const postId = await insertTestPost({
    title: `erased copyright reviewer ${crypto.randomUUID()}`,
    slug: `erased-copyright-reviewer-${crypto.randomUUID()}`,
    createdById: claimant.id,
    markdown: 'image',
  })
  const imageId = await insertTestImage(claimant.id)
  await insertTestPostImage({ postId, imageId })
  const notice = await createCopyrightFormIntake({
    requesterUserId: claimant.id,
    requesterIdentity: `user:${claimant.id}`,
    idempotencyKey: crypto.randomUUID(),
    request: {
      jurisdiction: 'us_dmca',
      claimantDisplayName: 'Claimant',
      claimantContact: 'claimant@example.test',
      claimantEmail: 'claimant@example.test',
      workDescription: 'Original photograph',
      goodFaithBelief: true,
      accuracyAuthorityUnderPenaltyOfPerjury: true,
      electronicSignature: 'Claimant',
      claimantTargets: [{ postId, imageId, hostedUseUrl: `https://voucha.ai/posts/${postId}` }],
    },
  })
  const screeningId = await appendCopyrightFormScreening({
    intakeId: notice.intake.id,
    inputSha256: Buffer.alloc(32),
    recommendation: 'not_obviously_invalid',
    rationale: 'No obvious spam markers.',
    promptVersion: 'copyright-form-screening-v2',
    model: 'test-model',
  })
  const assessment = await appendCopyrightSubmissionAssessment({
    submissionId: notice.intake.copyright_notice_submission_id,
    assessedAt: new Date(),
    currentUser: null,
    substantiallyCompliant: true,
    copyrightFormScreeningId: screeningId,
  })
  return { assessment, notice }
}

async function rejectWithErasedModerator(intakeId: string): Promise<void> {
  const moderator = await createTestUser()
  await createTestCopyrightFormRejectionByErasedModerator({ intakeId, moderatorId: moderator.id })
  await expect(readTestCopyrightFormReviewActor(intakeId)).resolves.toBeNull()
}

/** Recovers one owned rejection the sweep lists, then proves the sweep no longer lists it. */
async function recoverListedFormReview(intakeId: string): Promise<void> {
  await expect(
    readTestOwnedCopyrightSweepIds(searchRecoverableCopyrightFormReviewIntakeIds, intakeId),
  ).resolves.toEqual([intakeId])
  await recoverRejectedCopyrightFormReviewEffect(intakeId)
  await expect(
    readTestOwnedCopyrightSweepIds(searchRecoverableCopyrightFormReviewIntakeIds, intakeId),
  ).resolves.toEqual([])
}

describe('copyright rejected form-review recovery after actor erasure', () => {
  it('reverses the automated restriction from the durable erased rejection', async () => {
    const { assessment, notice } = await createAutomatedCopyrightForm()
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.intake.copyright_notice_id,
      targetId: aggregate!.targets[0]!.id,
      assessmentId: assessment.id,
      imposedAt: new Date(),
      imposedById: null,
    })
    await rejectWithErasedModerator(notice.intake.id)

    await recoverListedFormReview(notice.intake.id)

    const recovered = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    expect(recovered?.restrictions).toEqual([
      expect.objectContaining({ human_review_action: 'reverse', human_reviewed_by_id: null }),
    ])
    expect(recovered?.actionIntents).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'restore' })]),
    )
  })

  it('completes a pending automated request after the durable erased rejection', async () => {
    const { assessment, notice } = await createAutomatedCopyrightForm()
    await rejectWithErasedModerator(notice.intake.id)

    await recoverListedFormReview(notice.intake.id)

    await expect(readTestCopyrightEnforcementRequestState(assessment.id)).resolves.toBe('completed')
    await expect(processCopyrightEnforcementRequest(assessment.id)).resolves.toBe('not_claimed')
    const recovered = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    expect(recovered?.restrictions).toEqual([])
  })
})
