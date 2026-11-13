import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import type { createRequest } from './api/server.mts'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import { copyrightRestrictedRaceState } from './copyright-assessment-race-outcomes.mts'
import { createClearScreenedForm } from './services/copyright-notices/screened-form.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { createTestUser } from './index.mts'

/** The review TX may commit before a single-target enforcement TX loses SSI; neither may partially commit. */
export async function assertCopyrightApiFormAcceptance(
  staff: ReturnType<typeof createRequest>,
  moderatorId: string,
) {
  const [claimant, poster] = await Promise.all([createTestUser(), createTestUser()])
  const { notice } = await createClearScreenedForm(1, { claimant, poster })
  const noticeId = notice.intake.copyright_notice_id
  const intakeId = notice.intake.id
  const submissionId = notice.intake.copyright_notice_submission_id
  const read = async () => {
    const state = await readEffectiveReviewState(noticeId, [poster.id])
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    const { rows: reviews } = await write<{
      intake: string
      reviewer: string
      accepted: boolean
      rationale: string
    }>(sql`/* readApiFormAcceptance:reviews */
      SELECT copyright_notice_form_intake_id AS intake, reviewed_by_id AS reviewer,
        is_accepted AS accepted, rationale_ciphertext AS rationale
      FROM copyright_notice_form_intake_reviews WHERE copyright_notice_form_intake_id = ${intakeId}`)
    return {
      ...state,
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
  const response = await staff
    .post(`/api/v1/copyright-form-intakes/${intakeId}/reviews`)
    .send({ is_accepted: true, rationale: 'The signed notice is complete.' })
  const after = await read()
  const assessmentId = after.state.assessments[0]?.id
  const restrictionId = after.state.restrictions[0]?.id
  const target = before.state.targets[0]!
  const assessed = {
    ...before,
    reviews: [
      {
        intake: intakeId,
        reviewer: moderatorId,
        accepted: true,
        rationale: 'The signed notice is complete.',
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
    poster.id,
    target.placement_revision,
    true,
  )
  const completed = {
    ...assessed,
    accounts: before.accounts.map(account => ({
      ...account,
      incidents: [{ notice: noticeId, operative: true, disposition: null }],
    })),
    provenance: [{ account: poster.id, target: target.id }],
    state: {
      ...imposed,
      deliveries: [
        ...imposed.deliveries,
        `claimant_decision_notice:email:${claimant.id}`,
        `claimant_decision_notice:in_app:${claimant.id}`,
      ].toSorted(),
    },
  }
  const result = {
    notice: response.body.copyright_notice,
    submission: response.body.copyright_submission,
    accepted: response.body.is_accepted,
  }
  const failed = {
    status: 409,
    code: 'CONFLICT',
    message: 'Conflicting copyright case change',
    result: { notice: undefined, submission: undefined, accepted: undefined },
  }
  expect([
    { ...failed, state: before },
    { ...failed, state: assessed },
    {
      status: 200,
      code: undefined,
      message: undefined,
      result: { notice: { id: noticeId }, submission: { id: submissionId }, accepted: true },
      state: completed,
    },
  ]).toContainEqual({
    status: response.status,
    code: response.body.code,
    message: response.body.message,
    result,
    state: after,
  })
}
