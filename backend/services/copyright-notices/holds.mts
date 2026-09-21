import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type {
  CopyrightHoldProceedingKind,
  CopyrightHoldResolutionKind,
  CopyrightLegalHoldAssessmentRecord,
  CopyrightLegalHoldResolutionRecord,
} from './types.mts'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'

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
}): Promise<CopyrightLegalHoldAssessmentRecord> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assert(input.targetIds.length > 0, 422, 'A legal hold must identify at least one target')
  assert(
    new Set(input.targetIds).size === input.targetIds.length,
    422,
    'A legal hold target may only be identified once',
  )
  await using transaction = await beginTransaction()
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
      copyright_notice_submission_id, assessed_at, assessed_by_id, from_original_claimant,
      proceeding_kind, ccb_claim_kind, commenced_at, received_by_designated_agent_at, same_material
    ) VALUES (
      ${input.submissionId}, ${input.assessedAt}, ${input.currentUser.id}, ${input.fromOriginalClaimant},
      ${input.proceedingKind}, ${input.ccbClaimKind}, ${input.commencedAt},
      ${input.receivedByDesignatedAgentAt}, ${input.sameMaterial}
    )
    RETURNING id, copyright_notice_submission_id, assessed_at, assessed_by_id, from_original_claimant,
      proceeding_kind, ccb_claim_kind, commenced_at, received_by_designated_agent_at, same_material
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
  await transaction(sql`/* appendCopyrightLegalHoldAssessment:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, actor_user_id, metadata)
    VALUES (${submissionRows[0].copyright_notice_id}, 'legal_hold_assessed', ${input.currentUser.id},
      ${JSON.stringify({ targetIds: input.targetIds })}::jsonb)
  `)
  await transaction.commit()
  return { ...assessment, target_ids: input.targetIds }
}

export async function resolveCopyrightLegalHold(input: {
  currentUser: PrivateUser
  assessmentId: string
  resolvedAt: Date
  resolutionKind: CopyrightHoldResolutionKind
  rationaleCiphertext: string
}): Promise<CopyrightLegalHoldResolutionRecord> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  await using transaction = await beginTransaction()
  const { rows: assessmentRows } = await transaction<{
    copyright_notice_id: string
  }>(sql`/* resolveCopyrightLegalHold:lockAssessment */
    SELECT submission.copyright_notice_id
    FROM copyright_notice_legal_hold_assessments assessment
    JOIN copyright_notice_submissions submission
      ON submission.id = assessment.copyright_notice_submission_id
    JOIN copyright_notices notice ON notice.id = submission.copyright_notice_id
    WHERE assessment.id = ${input.assessmentId}
    FOR UPDATE OF notice, assessment
  `)
  const assessment = assessmentRows[0]
  assert(assessment, 404, 'Copyright legal hold assessment not found')
  const { rows } = await transaction(sql`/* resolveCopyrightLegalHold */
    INSERT INTO copyright_notice_legal_hold_resolutions (
      copyright_notice_legal_hold_assessment_id, resolved_at, resolved_by_id, resolution_kind,
      rationale_ciphertext
    ) VALUES (
      ${input.assessmentId}, ${input.resolvedAt}, ${input.currentUser.id}, ${input.resolutionKind},
      ${input.rationaleCiphertext}
    )
    ON CONFLICT (copyright_notice_legal_hold_assessment_id) DO NOTHING
    RETURNING id, copyright_notice_legal_hold_assessment_id, resolved_at, resolved_by_id,
      resolution_kind, rationale_ciphertext
  `)
  const resolution = rows[0] as CopyrightLegalHoldResolutionRecord | undefined
  assert(resolution, 409, 'Copyright legal hold is already resolved')
  await transaction(sql`/* resolveCopyrightLegalHold:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, actor_user_id, metadata)
    VALUES (${assessment.copyright_notice_id}, 'legal_hold_resolved', ${input.currentUser.id}, ${JSON.stringify({ resolutionKind: input.resolutionKind })}::jsonb)
  `)
  await transaction.commit()
  return resolution
}
