import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import {
  createCopyrightNoticeForManualAssociation,
  markTestCopyrightNoticeErasedAndCommit,
  isTestCopyrightCaseEvidenceErased,
} from '@voucha/test-helpers/copyright-email-manual-association'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { createMcpCopyrightFormIntake } from '@voucha/test-helpers/copyright-mcp-write-fixtures'
import { createTestCopyrightFormIntakeReview } from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import { interleaveCopyrightOwnedRead } from '@voucha/test-helpers/copyright-owned-read-interleave'
import {
  copyrightRaceResult,
  assessmentSerializationConflict,
  nativeCopyrightSerializationConflict,
  readCopyrightAssessmentRaceState,
} from '@voucha/test-helpers/copyright-assessment-race-outcomes'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'
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
    const before = await readCopyrightAssessmentRaceState(noticeId)
    const race = await interleaveCopyrightOwnedRead({
      ownedId: submission.id,
      marker: 'appendCopyrightSubmissionAssessment:lockSubmission',
      first: () =>
        appendCopyrightSubmissionAssessment({
          submissionId: submission.id,
          currentUser: moderator,
          substantiallyCompliant: true,
          assessedAt: new Date(),
        }),
      second: () => markTestCopyrightNoticeErasedAndCommit(noticeId),
    })
    expect(race.observerErrors).toEqual([])
    expect(race.second).toEqual({ status: 'fulfilled', value: undefined })
    expect([
      { result: assessmentSerializationConflict, state: before },
      {
        result: {
          status: 'rejected',
          statusCode: 410,
          code: undefined,
          message: 'Copyright case evidence was erased',
          causeCode: '23514',
        },
        state: before,
      },
    ]).toContainEqual({
      result: copyrightRaceResult(race.first),
      state: await readCopyrightAssessmentRaceState(noticeId),
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(await isTestCopyrightCaseEvidenceErased(noticeId)).toBe(true)
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
    const before = await readCopyrightAssessmentRaceState(intake.copyright_notice_id)
    const race = await interleaveCopyrightOwnedRead({
      ownedId: intake.copyright_notice_submission_id,
      marker: 'recoverMissingCopyrightDecisionAssessments',
      first: () =>
        recoverMissingDecisionAssessments({ ids: [intake.copyright_notice_submission_id] }),
      second: () => markTestCopyrightNoticeErasedAndCommit(intake.copyright_notice_id),
    })
    expect(race.observerErrors).toEqual([])
    expect(race.second).toEqual({ status: 'fulfilled', value: undefined })
    expect([
      { result: nativeCopyrightSerializationConflict, state: before },
      {
        result: {
          status: 'rejected',
          statusCode: 410,
          code: undefined,
          message: 'Copyright case evidence was erased',
          causeCode: '23514',
        },
        state: before,
      },
    ]).toContainEqual({
      result: copyrightRaceResult(race.first),
      state: await readCopyrightAssessmentRaceState(intake.copyright_notice_id),
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(intake.copyright_notice_id)
    expect(await isTestCopyrightCaseEvidenceErased(intake.copyright_notice_id)).toBe(true)
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
