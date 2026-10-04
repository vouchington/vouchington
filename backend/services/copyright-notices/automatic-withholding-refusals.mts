import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { checkAutomaticWithholdingCaps } from './automatic-withholding-caps.mts'
import type {
  AutomaticWithholdingEligibility,
  AutomaticWithholdingRefusalReason,
} from './automatic-withholding-gates.mts'

/**
 * Records that a submission failed an automatic-withholding gate, once per submission. The refusal
 * is sticky: a cap that clears later does not retry it, so a notice a moderator is already looking
 * at is not withheld behind their back. The submission stays in the staff queue and is never
 * dropped.
 */
export async function recordAutomaticWithholdingRefusal(
  transaction: TransactionQuery,
  submissionId: string,
  reason: AutomaticWithholdingRefusalReason,
): Promise<void> {
  await transaction(sql`/* recordAutomaticWithholdingRefusal */
    INSERT INTO copyright_automatic_withholding_refusals (
      copyright_notice_submission_id, reason, refused_at
    ) VALUES (${submissionId}, ${reason}, ${new Date()})
    ON CONFLICT (copyright_notice_submission_id) DO NOTHING
  `)
}

/**
 * Runs the abuse gates for one automated clear-screen decision and records the first refusal.
 * Returns true when a gate refused, so the caller leaves the notice with a moderator. A notice that
 * already has its automated assessment is re-checked only against the eligibility gates: that
 * assessment is already counted against the caps.
 */
export async function refuseAutomaticWithholding(
  transaction: TransactionQuery,
  input: {
    submissionId: string
    noticeId: string
    eligibility: AutomaticWithholdingEligibility
    hasAutomatedAssessment: boolean
  },
): Promise<boolean> {
  const { eligibility } = input
  const { rows: nonPostTargets } = await transaction<{ has_non_post_target: boolean }>(sql`
    /* refuseAutomaticWithholding:nonPostTarget */
    SELECT EXISTS (
      SELECT 1 FROM copyright_notice_targets target
      JOIN copyright_notice_target_images image_target
        ON image_target.copyright_notice_target_id = target.id
      WHERE target.copyright_notice_id = ${input.noticeId}
        AND image_target.binding_family <> 'post'
    ) AS has_non_post_target
  `)
  if (nonPostTargets[0]?.has_non_post_target) {
    await recordAutomaticWithholdingRefusal(transaction, input.submissionId, 'non_post_target')
    return true
  }
  if (eligibility.reason === null && input.hasAutomatedAssessment) return false
  const reason =
    eligibility.reason === null
      ? await checkAutomaticWithholdingCaps(transaction, {
          noticeId: input.noticeId,
          claimantId: eligibility.claimantId,
          thresholds: eligibility.thresholds,
        })
      : eligibility.reason
  if (!reason) return false
  await recordAutomaticWithholdingRefusal(transaction, input.submissionId, reason)
  return true
}
