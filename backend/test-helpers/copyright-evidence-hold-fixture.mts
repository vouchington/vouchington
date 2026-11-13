import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { advanceCopyrightLastLegalActivityAt } from '../services/copyright-notices/last-legal-activity.mts'
import { preemptCopyrightRestorations } from '../services/copyright-notices/restore-preemption.mts'
import { activateLateCopyrightLegalHoldRestrictions } from '../services/copyright-notices/holds-late-restrictions.mts'
import { isQualifyingCopyrightLegalHold } from '../services/copyright-notices/holds-qualification.mts'
import {
  replayEligibleCopyrightRestoreIntentsInTransaction,
  selectBlockedCopyrightRestoreIntentIds,
} from '../services/copyright-notices/court-hold-restore-replay.mts'
import type { appendCopyrightLegalHoldAssessment } from '../services/copyright-notices/holds.mts'
import type { resolveCopyrightLegalHold } from '../services/copyright-notices/hold-resolution.mts'

type Hold = Parameters<typeof appendCopyrightLegalHoldAssessment>[0] & { noticeId: string }
/** Target-scope probes require a complete committed qualifying hold, not a racing assessment. */
export async function seedEvidenceHold(input: Hold) {
  await using transaction = await beginTransaction()
  await preemptCopyrightRestorations(input.noticeId, transaction, input.targetIds)
  const { rows } = await transaction<{ id: string }>(sql`/* seedEvidenceHold */
    INSERT INTO copyright_notice_legal_hold_assessments (copyright_notice_submission_id,
      assessed_at, assessed_by_id, is_from_original_claimant, proceeding_kind, ccb_claim_kind,
      commenced_at, received_by_designated_agent_at, is_same_material, rationale_ciphertext)
    VALUES (${input.submissionId}, ${input.assessedAt}, ${input.currentUser.id}, ${input.fromOriginalClaimant},
      ${input.proceedingKind}, ${input.ccbClaimKind}, ${input.commencedAt}, ${input.receivedByDesignatedAgentAt},
      ${input.sameMaterial}, ${encryptSecret(input.rationale, `copyright-legal-hold-assessment:${input.submissionId}`)}) RETURNING id`)
  const hold = rows[0]!
  await transaction(sql`/* seedEvidenceHold:targets */
    INSERT INTO copyright_notice_legal_hold_assessment_targets (copyright_notice_legal_hold_assessment_id,
      copyright_notice_target_id) SELECT ${hold.id}, unnest(${input.targetIds}::uuid[])`)
  if (isQualifyingCopyrightLegalHold(input))
    await activateLateCopyrightLegalHoldRestrictions(
      hold.id,
      input.targetIds,
      input.receivedByDesignatedAgentAt!,
      transaction,
    )
  await transaction(sql`/* seedEvidenceHold:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
      copyright_notice_legal_hold_assessment_id) VALUES (${input.noticeId}, 'legal_hold_assessed', ${input.currentUser.id}, ${hold.id})`)
  await advanceCopyrightLastLegalActivityAt(transaction, { noticeId: input.noticeId })
  await transaction.commit()
  return { ...hold, target_ids: input.targetIds }
}

/** Resolution is a committed dependency of the following real restore eligibility probe. */
export async function seedEvidenceHoldResolution(
  input: Parameters<typeof resolveCopyrightLegalHold>[0] & { noticeId: string },
) {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    id: string
    copyright_notice_legal_hold_assessment_id: string
  }>(sql`/* seedEvidenceHoldResolution */
    INSERT INTO copyright_notice_legal_hold_resolutions (copyright_notice_legal_hold_assessment_id,
      resolved_at, resolved_by_id, resolution_kind, rationale_ciphertext)
    VALUES (${input.assessmentId}, ${input.resolvedAt}, ${input.currentUser.id}, ${input.resolutionKind},
      ${encryptSecret(input.rationale, `copyright-legal-hold-resolution:${input.assessmentId}`)})
    RETURNING id, copyright_notice_legal_hold_assessment_id`)
  const resolution = rows[0]!
  await transaction(sql`/* seedEvidenceHoldResolution:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
      copyright_notice_legal_hold_resolution_id) VALUES (${input.noticeId}, 'legal_hold_resolved', ${input.currentUser.id}, ${resolution.id})`)
  await replayEligibleCopyrightRestoreIntentsInTransaction({
    noticeId: input.noticeId,
    intentIds: await selectBlockedCopyrightRestoreIntentIds(input.noticeId, transaction),
    now: input.resolvedAt,
    query: transaction,
  })
  await advanceCopyrightLastLegalActivityAt(transaction, { noticeId: input.noticeId })
  await transaction.commit()
  return resolution
}
