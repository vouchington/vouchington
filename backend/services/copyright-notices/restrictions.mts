import { insertCopyrightActionIntent } from './action-intent-insertion.mts'
import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { getImagePlacementKey } from '@services/images/placements'
import type { CopyrightRestrictionRecord } from './types.mts'
import { createCopyrightPosterNoticesInTransaction } from './restriction-poster-notices.mts'
import { enqueueApplyCopyrightAction } from '@queues/notifications/enqueues'
import { lockAssessmentForm } from './compliance.mts'
import { createCopyrightClaimantDecisionNoticeInTransaction } from './claimant-decision-notices.mts'
import {
  applyCopyrightConfirmationConsequencesInTransaction,
  enqueueCopyrightStaydownHashes,
} from './staydown-registration.mts'
import { territorialAssessmentRevokedSql } from './restriction-reversal-sources-sql.mts'

export async function acceptCopyrightNoticeAndImposeRestriction(input: {
  noticeId: string
  targetId: string
  assessmentId: string
  imposedAt: Date
  imposedById: string | null
}): Promise<CopyrightRestrictionRecord> {
  await using transaction = await beginTransaction()
  const { rows: targetRows } = await transaction<{ placement_id: string }>(
    sql`/* acceptCopyrightNoticeAndImposeRestriction:findTarget */
    SELECT placement_id
    FROM copyright_notice_targets
    WHERE id = ${input.targetId} AND copyright_notice_id = ${input.noticeId}
  `,
  )
  const target = targetRows[0]
  assert(target, 404, 'Copyright notice target not found')
  await transaction(sql`/* acceptCopyrightNoticeAndImposeRestriction:placementAdvisoryLock */
    SELECT pg_advisory_xact_lock(hashtextextended(${getImagePlacementKey(target.placement_id)}, 0))
  `)
  const { rows: formAuthorities } = await transaction<{
    copyright_notice_submission_id: string
  }>(sql`/* acceptCopyrightNoticeAndImposeRestriction:formAuthority */
    SELECT copyright_notice_submission_id FROM copyright_notice_submission_assessments WHERE id = ${input.assessmentId}
  `)
  if (formAuthorities[0])
    await lockAssessmentForm(formAuthorities[0].copyright_notice_submission_id, transaction)
  const { rows: noticeRows } = await transaction<{ id: string }>(
    sql`/* acceptCopyrightNoticeAndImposeRestriction:lockNotice */
    SELECT id FROM copyright_notices WHERE id = ${input.noticeId} FOR UPDATE
  `,
  )
  assert(noticeRows[0], 404, 'Copyright notice not found')
  const { rows: lockedTargets } = await transaction<{ id: string; placement_revision: number }>(
    sql`/* acceptCopyrightNoticeAndImposeRestriction:lockTarget */
    SELECT id, placement_revision
    FROM copyright_notice_targets
    WHERE id = ${input.targetId}
      AND copyright_notice_id = ${input.noticeId}
      AND placement_id = ${target.placement_id}
    FOR UPDATE
  `,
  )
  assert(lockedTargets[0], 409, 'Copyright notice target changed while being restricted')
  const { rows: assessmentRows } = await transaction<{
    source_kind: 'signed_in_form' | 'guest_form' | 'email' | 'staff'
    assessed_by_id: string | null
    copyright_notice_form_screening_id: string | null
    is_substantially_compliant: boolean
    current_screening_authority: boolean
    has_rejected_form_review: boolean
    territorial_revoked: boolean
  }>(
    sql`/* acceptCopyrightNoticeAndImposeRestriction:lockAssessment */
    SELECT submission.source_kind, assessment.assessed_by_id, assessment.is_substantially_compliant, assessment.copyright_notice_form_screening_id,
      assessment.copyright_notice_form_screening_id IS NULL OR fn_current_copyright_form_screening(
        submission.id, assessment.copyright_notice_form_screening_id
      ) AS current_screening_authority,
      EXISTS (
        SELECT 1
        FROM copyright_notice_form_intakes intake
        JOIN copyright_notice_form_intake_reviews review
          ON review.copyright_notice_form_intake_id = intake.id
        WHERE intake.copyright_notice_submission_id = assessment.copyright_notice_submission_id
          AND NOT review.is_accepted
      ) AS has_rejected_form_review, `.append(territorialAssessmentRevokedSql)
      .append(sql` AS territorial_revoked
    FROM copyright_notice_submission_assessments assessment
    JOIN copyright_notice_submissions submission
      ON submission.id = assessment.copyright_notice_submission_id
    WHERE assessment.id = ${input.assessmentId}
      AND submission.copyright_notice_id = ${input.noticeId}
      AND submission.kind = 'notice'
      AND NOT EXISTS (
        SELECT 1
        FROM copyright_notice_submission_assessments newer
        WHERE newer.supersedes_assessment_id = assessment.id
      )
    FOR UPDATE OF assessment, submission
  `),
  )
  const assessment = assessmentRows[0]
  assert(assessment, 422, 'A current notice assessment is required before restriction')
  assert(assessment.is_substantially_compliant, 422, 'Copyright notice assessment is not compliant')
  assert(!assessment.has_rejected_form_review, 422, 'Copyright notice form review was rejected')
  assert(!assessment.territorial_revoked, 409, 'Territorial decision was revoked')
  assert(
    assessment.current_screening_authority,
    422,
    'Copyright screening authority is not current',
  )
  const { rows: acceptedRows } = await transaction<{
    id: string
  }>(sql`/* acceptCopyrightNoticeAndImposeRestriction:accept */
    UPDATE copyright_notices
    SET accepted_at = COALESCE(accepted_at, ${input.imposedAt}),
      provisional_withholding_at = COALESCE(provisional_withholding_at, ${input.imposedAt})
    WHERE id = ${input.noticeId}
      AND EXISTS (SELECT 1 FROM copyright_notice_targets WHERE id = ${input.targetId})
    RETURNING id
  `)
  assert(acceptedRows[0], 404, 'Copyright notice not found')
  const { rows } =
    await transaction<CopyrightRestrictionRecord>(sql`/* acceptCopyrightNoticeAndImposeRestriction */
    INSERT INTO copyright_restrictions (
      copyright_notice_target_id, authorizing_assessment_id, imposed_at, imposed_by_id,
      human_reviewed_at, human_review_action, human_reviewed_by_id
    ) VALUES (
      ${input.targetId}, ${input.assessmentId}, ${input.imposedAt}, ${input.imposedById},
      ${input.imposedById ? input.imposedAt : null}, ${input.imposedById ? 'confirm' : null},
      ${input.imposedById}
    )
    ON CONFLICT (copyright_notice_target_id) WHERE lifted_at IS NULL DO NOTHING
    RETURNING id, copyright_notice_target_id, authorizing_assessment_id, imposed_at, lifted_at, imposed_by_id, lifted_by_id,
      human_reviewed_at, human_review_action, human_reviewed_by_id
  `)
  const restriction = rows[0]
  assert(restriction, 409, 'An active copyright restriction already exists for this target')
  // ast-grep-ignore: no-three-sequential-awaits -- the fenced action intent and legal delivery obligations are ordered in one transaction.
  const actionIntent = await insertCopyrightActionIntent(
    transaction,
    restriction.id,
    lockedTargets[0].placement_revision,
    'withhold',
  )
  await createCopyrightPosterNoticesInTransaction(
    {
      noticeId: input.noticeId,
      targetId: input.targetId,
      restrictionId: restriction.id,
      event: 'restricted',
    },
    transaction,
  )
  await createCopyrightClaimantDecisionNoticeInTransaction(
    { noticeId: input.noticeId, event: 'restricted', assessmentId: input.assessmentId },
    transaction,
  )
  let staydownImageIds: string[] = []
  if (restriction.human_review_action === 'confirm') {
    staydownImageIds = await applyCopyrightConfirmationConsequencesInTransaction(
      input.noticeId,
      transaction,
    )
  }
  await transaction(sql`/* acceptCopyrightNoticeAndImposeRestriction:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id, copyright_restriction_id)
    VALUES (${input.noticeId}, 'provisional_restriction_imposed', ${input.imposedById}, ${restriction.id})
  `)
  await transaction.commit()
  void enqueueApplyCopyrightAction(actionIntent.id)
  enqueueCopyrightStaydownHashes(staydownImageIds)
  return restriction
}
