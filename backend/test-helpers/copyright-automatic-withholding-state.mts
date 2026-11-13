import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { getPendingCopyrightAgentDispatches } from '../services/copyright-notices/reconcile-agent-dispatches.mts'
import type { createClearScreenedForm } from './services/copyright-notices/screened-form.mts'

export type AutomaticNotice = Awaited<ReturnType<typeof createClearScreenedForm>>['notice']
/** Current screening/execution authority, all legal/account effects, refusal and workflow ownership. */
export async function readAutomaticWithholdingState(notice: AutomaticNotice) {
  const intake = notice.intake
  const [
    { rows: parties },
    aggregate,
    { rows: screens },
    { rows: executions },
    { rows: refusals },
    { rows: reviews },
    { rows: proofs },
    { rows: clocks },
    pending,
  ] = await Promise.all([
    write<{ claimant: string; poster: string }>(sql`/* readAutomaticState:parties */
      SELECT notice.claimant_user_id AS claimant, image.created_by_id AS poster
      FROM copyright_notices notice JOIN copyright_notice_targets target ON target.copyright_notice_id = notice.id
      JOIN copyright_notice_target_images target_image ON target_image.copyright_notice_target_id = target.id
      JOIN images image ON image.id = target_image.image_id WHERE notice.id = ${intake.copyright_notice_id}`),
    getCopyrightNoticePrivateAggregate(intake.copyright_notice_id),
    write<{
      id: string
    }>(sql`/* readAutomaticState:screens */ SELECT * FROM copyright_notice_form_screenings
      WHERE copyright_notice_form_intake_id = ${intake.id} ORDER BY id`),
    write<{
      id: string
      copyright_notice_form_screening_id: string | null
      state: string
    }>(sql`/* readAutomaticState:executions */
      SELECT * FROM copyright_notice_form_screening_attempts WHERE copyright_notice_form_intake_id = ${intake.id} ORDER BY attempt_number`),
    write<{ submission: string; reason: string; at: Date }>(sql`/* readAutomaticState:refusals */
      SELECT copyright_notice_submission_id AS submission, reason, refused_at AS at FROM copyright_automatic_withholding_refusals
      WHERE copyright_notice_submission_id = ${intake.copyright_notice_submission_id}`),
    write<{
      intake: string
      reviewer: string
      accepted: boolean
      rationale: string
    }>(sql`/* readAutomaticState:reviews */
      SELECT copyright_notice_form_intake_id AS intake, reviewed_by_id AS reviewer, is_accepted AS accepted,
        rationale_ciphertext AS rationale FROM copyright_notice_form_intake_reviews WHERE copyright_notice_form_intake_id = ${intake.id}`),
    write<{
      id: string
      assessment: string
      automated: boolean
      imposedBy: string | null
    }>(sql`/* readAutomaticState:restrictionProof */
      SELECT restriction.id, restriction.authorizing_assessment_id AS assessment,
        restriction.is_authorizing_assessment_automated AS automated, restriction.imposed_by_id AS "imposedBy"
      FROM copyright_restrictions restriction JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE target.copyright_notice_id = ${intake.copyright_notice_id} ORDER BY restriction.id`),
    write<{ at: Date }>(
      sql`/* readAutomaticState:clock */ SELECT last_legal_activity_at AS at FROM copyright_notices WHERE id = ${intake.copyright_notice_id}`,
    ),
    getPendingCopyrightAgentDispatches({ ids: [intake.copyright_notice_submission_id], limit: 1 }),
  ])
  if (!aggregate || parties.length !== 1 || !clocks[0])
    throw new Error('Owned automatic notice lost its current target or clock')
  const current = executions.at(-1)
  if (
    !current ||
    current.state !== 'completed' ||
    !current.copyright_notice_form_screening_id ||
    !screens.some(row => row.id === current.copyright_notice_form_screening_id)
  )
    throw new Error('Owned automatic notice has no completed current screening authority')
  return {
    effective: await readEffectiveReviewState(intake.copyright_notice_id, [parties[0]!.poster]),
    notice: aggregate.notice,
    screens,
    executions,
    refusals,
    proofs,
    clock: clocks[0].at,
    reviews: reviews.map(row => ({
      ...row,
      rationale: decryptSecret(row.rationale, `copyright-form-review:${intake.id}`),
    })),
    assessors: aggregate.assessments.map(row => ({
      id: row.id,
      submission: row.copyright_notice_submission_id,
      at: row.assessed_at,
      reviewer: row.assessed_by_id,
      screen: row.copyright_notice_form_screening_id,
    })),
    dispatches: pending.results,
    claimantId: parties[0]!.claimant,
    posterId: parties[0]!.poster,
    screeningId: current.copyright_notice_form_screening_id,
  }
}
