import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import { reviewCopyrightFormIntake } from '../services/copyright-notices/form-reviews.mts'
import { isCopyrightStaydownMatchingEnabled } from '../services/copyright-notices/config.mts'
import { searchPendingCopyrightEnforcementAssessmentIds } from '../services/copyright-notices/enforcement-pending.mts'
import { getImagePlacementForCopyright } from '../services/images/placements.mts'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { readTestOwnedCopyrightSweepIds } from './services/copyright-notices/sweep-ids.mts'
import {
  copyrightRestrictedRaceState,
  copyrightRaceResult,
} from './copyright-assessment-race-outcomes.mts'
import { effectiveReviewConflict } from './copyright-effective-review-outcomes.mts'
import type { createCopyrightFormIntake } from '../services/copyright-notices/form-intakes.mts'

type Form = Awaited<ReturnType<typeof createCopyrightFormIntake>>

export async function readGuestApprovalState(notice: Form, posterId: string) {
  const noticeId = notice.intake.copyright_notice_id
  const intakeId = notice.intake.id
  const [effective, aggregate, { rows: reviews }] = await Promise.all([
    readEffectiveReviewState(noticeId, [posterId]),
    getCopyrightNoticePrivateAggregate(noticeId),
    write<{
      intake: string
      reviewer: string
      accepted: boolean
      rationale: string
    }>(sql`/* readGuestApprovalState */
      SELECT copyright_notice_form_intake_id AS intake, reviewed_by_id AS reviewer,
        is_accepted AS accepted, rationale_ciphertext AS rationale
      FROM copyright_notice_form_intake_reviews WHERE copyright_notice_form_intake_id = ${intakeId}`),
  ])
  if (!aggregate?.targets[0]) throw new Error('Owned guest target disappeared')
  return {
    ...effective,
    physical: await getImagePlacementForCopyright(aggregate.targets[0].placement_id),
    reviews: reviews.map(row => ({
      ...row,
      rationale: decryptSecret(row.rationale, `copyright-form-review:${intakeId}`),
    })),
    assessors: aggregate.assessments.map(row => ({
      id: row.id,
      by: row.assessed_by_id,
      screening: row.copyright_notice_form_screening_id,
    })),
  }
}

/** Review authority commits before its real single-target enforcement, which may independently lose SSI. */
export async function assertGuestFormApproval(
  notice: Form,
  posterId: string,
  input: Omit<Parameters<typeof reviewCopyrightFormIntake>[0], 'intakeId'>,
) {
  const noticeId = notice.intake.copyright_notice_id
  const submissionId = notice.intake.copyright_notice_submission_id
  const before = await readGuestApprovalState(notice, posterId)
  expect(before.reviews).toEqual([])
  expect(before.state.assessments).toEqual([])
  expect(before.state.restrictions).toEqual([])
  expect(before.physical?.withheld).toBe(false)
  const staydown = await isCopyrightStaydownMatchingEnabled()
  const [result] = await Promise.allSettled([
    reviewCopyrightFormIntake({ ...input, intakeId: notice.intake.id }),
  ])
  const after = await readGuestApprovalState(notice, posterId)
  const assessmentId = after.state.assessments[0]?.id
  const restrictionId = after.state.restrictions[0]?.id
  const target = before.state.targets[0]!
  const pending = assessmentId
    ? await readTestOwnedCopyrightSweepIds(
        searchPendingCopyrightEnforcementAssessmentIds,
        assessmentId,
      )
    : []
  const assessed = {
    ...before,
    reviews: [
      {
        intake: notice.intake.id,
        reviewer: input.currentUser.id,
        accepted: true,
        rationale: input.rationale,
      },
    ],
    assessors: [{ id: assessmentId, by: input.currentUser.id, screening: null }],
    state: {
      ...before.state,
      assessments: [{ id: assessmentId, supersedes: null, compliant: true }],
      identities: [assessmentId],
      pointers: [{ id: submissionId, assessment: assessmentId, compliant: true }],
      events: [...before.state.events, 'submission_assessed'].toSorted(),
    },
  }
  const completed = {
    ...assessed,
    accounts: before.accounts.map(account => ({
      ...account,
      incidents: [{ notice: noticeId, operative: true, disposition: null }],
    })),
    provenance: [{ account: posterId, target: target.id }],
    state: {
      ...copyrightRestrictedRaceState(
        assessed.state,
        { assessmentId: assessmentId!, targetId: target.id, imposedById: input.currentUser.id },
        restrictionId,
        posterId,
        target.placement_revision,
        staydown,
      ),
      deliveries: [
        ...before.state.deliveries,
        `poster_restriction_notice:email:${posterId}`,
        `poster_restriction_notice:in_app:${posterId}`,
        'claimant_decision_notice:email:null',
      ].toSorted(),
    },
  }
  expect([
    { outcome: effectiveReviewConflict, state: before, pending: [] },
    { outcome: effectiveReviewConflict, state: assessed, pending: [assessmentId] },
    {
      outcome: { status: 'fulfilled', noticeId, submissionId, is_accepted: true },
      state: completed,
      pending: [],
    },
  ]).toContainEqual({
    outcome:
      result!.status === 'fulfilled'
        ? { status: 'fulfilled', ...result!.value }
        : copyrightRaceResult(result!),
    state: after,
    pending,
  })
}
