import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightHoldProceedingKind, CopyrightLegalHoldAssessmentRecord } from './types.mts'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import {
  replayEligibleCopyrightRestoreIntentsInTransaction,
  selectBlockedCopyrightRestoreIntentIds,
} from './court-hold-restore-replay.mts'
import { lockCopyrightNoticeHoldPlacements } from './hold-placement-locks.mts'
import { enqueueApplyCopyrightAction } from '@queues/notifications/enqueues'
import { activateLateCopyrightLegalHoldRestrictions } from './holds-late-restrictions.mts'
import { isQualifyingCopyrightLegalHold } from './holds-qualification.mts'
import { encryptSecret } from '@modules/token-secrets'
import type { prepublishImagePlacementDenial } from '@services/media-delivery-safety'

export async function appendCopyrightLegalHoldAssessment(input: {
  currentUser: PrivateUser
  submissionId: string
  assessedAt: Date
  fromOriginalClaimant: boolean
  proceedingKind: CopyrightHoldProceedingKind | null
  ccbClaimKind: 'claim' | 'counterclaim' | null
  commencedAt: Date | null
  receivedByDesignatedAgentAt: Date | null
  sameMaterial: boolean
  targetIds: string[]
  rationale: string
  dependencies?: {
    assertLegalEnforcementEnabled?: () => void
    publishPlacement?: typeof prepublishImagePlacementDenial
  }
}): Promise<CopyrightLegalHoldAssessmentRecord> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assert(input.targetIds.length > 0, 422, 'A legal hold must identify at least one target')
  assert(
    new Set(input.targetIds).size === input.targetIds.length,
    422,
    'A legal hold target may only be identified once',
  )
  await using transaction = await beginTransaction()
  let lateHoldIntentIds: string[] = []
  const { rows: identities } = await transaction<{ copyright_notice_id: string }>(sql`
    /* appendCopyrightLegalHoldAssessment:identity */
    SELECT copyright_notice_id FROM copyright_notice_submissions WHERE id = ${input.submissionId}
  `)
  assert(identities[0], 404, 'Copyright legal-hold submission not found')
  await lockCopyrightNoticeHoldPlacements(identities[0].copyright_notice_id, transaction)
  const { rows: submissionRows } = await transaction<{
    kind: string
    copyright_notice_id: string
  }>(sql`/* appendCopyrightLegalHoldAssessment:lockNotice */
    SELECT s.kind, s.copyright_notice_id
    FROM copyright_notice_submissions s
    JOIN copyright_notices n ON n.id = s.copyright_notice_id
    WHERE s.id = ${input.submissionId}
    FOR UPDATE OF n, s
  `)
  assert(submissionRows[0], 404, 'Copyright legal-hold submission not found')
  assert(
    submissionRows[0].kind === 'court_or_ccb_hold',
    422,
    'Submission is not a court or CCB hold',
  )
  const { rows } = await transaction(sql`/* appendCopyrightLegalHoldAssessment */
    INSERT INTO copyright_notice_legal_hold_assessments (
      copyright_notice_submission_id, assessed_at, assessed_by_id, is_from_original_claimant,
      proceeding_kind, ccb_claim_kind, commenced_at, received_by_designated_agent_at, is_same_material,
      rationale_ciphertext
    ) VALUES (
      ${input.submissionId}, ${input.assessedAt}, ${input.currentUser.id}, ${input.fromOriginalClaimant},
      ${input.proceedingKind}, ${input.ccbClaimKind}, ${input.commencedAt},
      ${input.receivedByDesignatedAgentAt}, ${input.sameMaterial},
      ${encryptSecret(input.rationale, `copyright-legal-hold-assessment:${input.submissionId}`)}
    )
    RETURNING id, copyright_notice_submission_id, assessed_at, assessed_by_id, is_from_original_claimant,
      proceeding_kind, ccb_claim_kind, commenced_at, received_by_designated_agent_at, is_same_material,
      rationale_ciphertext
  `)
  const assessment = rows[0] as Omit<CopyrightLegalHoldAssessmentRecord, 'target_ids'> | undefined
  assert(assessment, 500, 'Failed to append copyright legal-hold assessment')
  const { rows: linkedTargets } = await transaction<{ copyright_notice_target_id: string }>(
    sql`/* appendCopyrightLegalHoldAssessment:targets */
    WITH supplied_targets AS (
      SELECT target_id::uuid
      FROM jsonb_array_elements_text(${JSON.stringify(input.targetIds)}::jsonb) AS target_id
    ), case_targets AS (
      SELECT target.id
      FROM copyright_notice_targets target
      JOIN supplied_targets supplied ON supplied.target_id = target.id
      WHERE target.copyright_notice_id = ${submissionRows[0].copyright_notice_id}
    )
    INSERT INTO copyright_notice_legal_hold_assessment_targets (
      copyright_notice_legal_hold_assessment_id, copyright_notice_target_id
    )
    SELECT ${assessment.id}, id FROM case_targets
    RETURNING copyright_notice_target_id
  `,
  )
  assert(
    linkedTargets.length === input.targetIds.length,
    422,
    'A legal hold target does not belong to this copyright notice',
  )
  if (isQualifyingCopyrightLegalHold(input)) {
    lateHoldIntentIds = await activateLateCopyrightLegalHoldRestrictions(
      assessment.id,
      input.targetIds,
      input.receivedByDesignatedAgentAt!,
      transaction,
      input.dependencies,
    )
  }
  await transaction(sql`/* appendCopyrightLegalHoldAssessment:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
      copyright_notice_legal_hold_assessment_id)
    VALUES (${submissionRows[0].copyright_notice_id}, 'legal_hold_assessed', ${input.currentUser.id},
      ${assessment.id})
  `)
  const replayedIds = await replayEligibleCopyrightRestoreIntentsInTransaction({
    noticeId: submissionRows[0].copyright_notice_id,
    intentIds: await selectBlockedCopyrightRestoreIntentIds(
      submissionRows[0].copyright_notice_id,
      transaction,
    ),
    now: input.assessedAt,
    query: transaction,
  })
  await transaction.commit()
  for (const intentId of new Set([...lateHoldIntentIds, ...replayedIds]))
    void enqueueApplyCopyrightAction(intentId)
  return { ...assessment, target_ids: input.targetIds }
}
