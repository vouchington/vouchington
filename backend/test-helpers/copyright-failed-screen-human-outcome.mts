import { isCopyrightStaydownMatchingEnabled } from '../services/copyright-notices/config.mts'
import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '../services/users/types.mts'
import { reviewCopyrightFormIntake } from '../services/copyright-notices/form-reviews.mts'
import { readCopyrightCaseLifecycleClock } from './copyright-lifecycle-clock.mts'
import { readTestCopyrightStaffScreening } from './data-stores/psql/copyright-screening-executions.mts'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import {
  copyrightRestrictedRaceState,
  copyrightRaceResult,
} from './copyright-assessment-race-outcomes.mts'
import type { createSignedInCopyrightForm } from './services/copyright-notices/screened-form.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'

/** Human approval is atomic; enforcement can independently abort after committed human authority. */
export async function assertFailedScreenHumanApproval(
  intake: Awaited<ReturnType<typeof createSignedInCopyrightForm>>['intake'],
  moderator: PrivateUser,
  claimantId: string,
  posterId: string,
) {
  const noticeId = intake.copyright_notice_id
  const intakeId = intake.id
  const submissionId = intake.copyright_notice_submission_id
  const moderatorId = moderator.id
  const read = async () => {
    const state = await readEffectiveReviewState(noticeId, [posterId])
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    const { rows: reviews } = await write<{
      intake: string
      reviewer: string
      accepted: boolean
      rationale: string
    }>(sql`/* readFailedScreenHumanApproval:reviews */
      SELECT copyright_notice_form_intake_id AS intake, reviewed_by_id AS reviewer,
        is_accepted AS accepted, rationale_ciphertext AS rationale
      FROM copyright_notice_form_intake_reviews WHERE copyright_notice_form_intake_id = ${intakeId}`)
    return {
      ...state,
      clock: await readCopyrightCaseLifecycleClock(noticeId),
      screening: await readTestCopyrightStaffScreening(noticeId),
      reviews: reviews.map(row => ({
        ...row,
        rationale: decryptSecret(row.rationale, `copyright-form-review:${intakeId}`),
      })),
      assessors: aggregate!.assessments.map(row => ({
        id: row.id,
        by: row.assessed_by_id,
        screening: row.copyright_notice_form_screening_id,
      })),
    }
  }
  const before = await read()
  expect(before.screening).toMatchObject({ state: 'failed' })
  expect(before.state.assessments).toEqual([])
  expect(before.state.restrictions).toEqual([])
  const [response] = await Promise.allSettled([
    reviewCopyrightFormIntake({
      intakeId,
      currentUser: moderator,
      is_accepted: true,
      rationale: 'Human statutory review.',
    }),
  ])
  const after = await read()
  const assessmentId = after.state.assessments[0]?.id
  const restrictionId = after.state.restrictions[0]?.id
  const target = before.state.targets[0]!
  const assessed = {
    ...before,
    clock: expect.any(Date),
    reviews: [
      {
        intake: intakeId,
        reviewer: moderatorId,
        accepted: true,
        rationale: 'Human statutory review.',
      },
    ],
    assessors: [{ id: assessmentId, by: moderatorId, screening: null }],
    state: {
      ...before.state,
      assessments: [{ id: assessmentId, supersedes: null, compliant: true }],
      identities: [assessmentId],
      pointers: [{ id: submissionId, assessment: assessmentId, compliant: true }],
      events: [...before.state.events, 'submission_assessed'].toSorted(),
    },
  }
  const imposed = copyrightRestrictedRaceState(
    assessed.state,
    { assessmentId: assessmentId!, targetId: target.id, imposedById: moderatorId },
    restrictionId,
    posterId,
    target.placement_revision,
    await isCopyrightStaydownMatchingEnabled(),
  )
  const completed = {
    ...assessed,
    accounts: before.accounts.map(account => ({
      ...account,
      incidents: [{ notice: noticeId, operative: true, disposition: null }],
    })),
    provenance: [{ account: posterId, target: target.id }],
    state: {
      ...imposed,
      deliveries: [
        ...imposed.deliveries,
        `claimant_decision_notice:email:${claimantId}`,
        `claimant_decision_notice:in_app:${claimantId}`,
      ].toSorted(),
    },
  }
  const conflict = {
    status: 'rejected',
    statusCode: 409,
    code: 'CONFLICT',
    message: 'Conflicting copyright case change',
    causeCode: '40001',
  }
  expect([
    { outcome: conflict, state: before },
    { outcome: conflict, state: assessed },
    {
      outcome: { status: 'fulfilled', value: { noticeId, submissionId, is_accepted: true } },
      state: completed,
    },
  ]).toContainEqual({
    outcome: response!.status === 'fulfilled' ? response : copyrightRaceResult(response!),
    state: after,
  })
}
