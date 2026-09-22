import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { recoverMissingDecisionAssessments } from './enforcement-recovery.mts'
import {
  claimCopyrightEnforcementRequest,
  completeNonEnforceableCopyrightEnforcementRequest,
  type EnforcementRequest,
} from './enforcement-request-claim.mts'
import { recoverRejectedCopyrightFormReviewEffects } from './form-reviews-recovery.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'

export async function processCopyrightEnforcementRequest(
  assessmentId: string,
  dependencies: {
    imposeRestriction?: typeof acceptCopyrightNoticeAndImposeRestriction
  } = {},
): Promise<'completed' | 'not_claimed'> {
  const imposeRestriction =
    dependencies.imposeRestriction ?? acceptCopyrightNoticeAndImposeRestriction
  const request = await claimCopyrightEnforcementRequest(assessmentId)
  if (!request) return 'not_claimed'
  if (request === 'completed') return 'completed'
  try {
    const { rows: targets } = await write<{ id: string }>(sql`
      /* processCopyrightEnforcementRequest:missingTargets */
      SELECT target.id
      FROM copyright_notice_targets target
      WHERE target.copyright_notice_id = ${request.notice_id}
        AND NOT EXISTS (
          SELECT 1 FROM copyright_restrictions restriction
          WHERE restriction.copyright_notice_target_id = target.id
            AND restriction.lifted_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM copyright_restrictions restriction
          JOIN copyright_notice_submission_assessments authority
            ON authority.id = restriction.authorizing_assessment_id
          WHERE restriction.copyright_notice_target_id = target.id
            AND authority.copyright_notice_submission_id = (
              SELECT copyright_notice_submission_id
              FROM copyright_notice_submission_assessments
              WHERE id = ${request.assessment_id}
            )
            AND authority.assessed_by_id IS NULL
            AND restriction.lifted_at IS NOT NULL
        )
      ORDER BY target.id
    `)
    await imposeRestrictionsSequentially(targets, request, imposeRestriction)
    const { rows } = await write(sql`/* processCopyrightEnforcementRequest:complete */
      UPDATE copyright_notice_enforcement_requests request
      SET state = 'completed', claimed_at = NULL, completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE request.copyright_notice_submission_assessment_id = ${request.assessment_id}
        AND request.state = 'claimed'
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_targets target
          WHERE target.copyright_notice_id = request.copyright_notice_id
            AND NOT EXISTS (
              SELECT 1 FROM copyright_restrictions restriction
              WHERE restriction.copyright_notice_target_id = target.id
                AND restriction.lifted_at IS NULL
            )
            AND NOT EXISTS (
              SELECT 1 FROM copyright_restrictions restriction
              JOIN copyright_notice_submission_assessments authority
                ON authority.id = restriction.authorizing_assessment_id
              WHERE restriction.copyright_notice_target_id = target.id
                AND authority.copyright_notice_submission_id = (
                  SELECT copyright_notice_submission_id
                  FROM copyright_notice_submission_assessments
                  WHERE id = ${request.assessment_id}
                )
                AND authority.assessed_by_id IS NULL
                AND restriction.lifted_at IS NOT NULL
            )
        )
      RETURNING copyright_notice_submission_assessment_id
    `)
    if (!rows[0]) throw new Error('Copyright enforcement request still has unrestricted targets')
    return 'completed'
  } catch (error) {
    if (await completeNonEnforceableCopyrightEnforcementRequest(request.assessment_id)) {
      return 'completed'
    }
    await write(sql`/* processCopyrightEnforcementRequest:release */
      UPDATE copyright_notice_enforcement_requests
      SET state = 'pending', claimed_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE copyright_notice_submission_assessment_id = ${request.assessment_id}
        AND state = 'claimed'
    `)
    throw error
  }
}

export async function reconcileCopyrightEnforcementRequests(limit = 100): Promise<number> {
  await recoverRejectedCopyrightFormReviewEffects()
  await recoverMissingDecisionAssessmentsAndBackfill()
  const { rows } = await write<{ assessment_id: string }>(sql`
    /* reconcileCopyrightEnforcementRequests:list */
    SELECT copyright_notice_submission_assessment_id AS assessment_id
    FROM copyright_notice_enforcement_requests
    WHERE state = 'pending'
      OR (state = 'claimed' AND claimed_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes')
    ORDER BY updated_at, copyright_notice_submission_assessment_id
    LIMIT ${limit}
  `)
  const outcomes = await Promise.all(
    rows.map(row => processCopyrightEnforcementRequest(row.assessment_id)),
  )
  return outcomes.filter(outcome => outcome === 'completed').length
}

async function recoverMissingDecisionAssessmentsAndBackfill(): Promise<void> {
  await recoverMissingDecisionAssessments()
  await write(sql`/* reconcileCopyrightEnforcementRequests:backfill */
    INSERT INTO copyright_notice_enforcement_requests (
      copyright_notice_submission_assessment_id, copyright_notice_id, imposed_by_id
    )
    SELECT assessment.id, submission.copyright_notice_id, assessment.assessed_by_id
    FROM copyright_notice_submission_assessments assessment
    JOIN copyright_notice_submissions submission
      ON submission.id = assessment.copyright_notice_submission_id
    WHERE submission.kind = 'notice' AND assessment.substantially_compliant
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_submission_assessments newer
        WHERE newer.supersedes_assessment_id = assessment.id
      )
    ORDER BY assessment.id ASC NULLS LAST
    ON CONFLICT (copyright_notice_submission_assessment_id) DO NOTHING
  `)
}

async function imposeRestrictionsSequentially(
  targets: Array<{ id: string }>,
  request: EnforcementRequest,
  imposeRestriction: typeof acceptCopyrightNoticeAndImposeRestriction,
  index = 0,
): Promise<void> {
  const target = targets[index]
  if (!target) return
  await imposeRestriction({
    noticeId: request.notice_id,
    targetId: target.id,
    assessmentId: request.assessment_id,
    imposedAt: new Date(),
    imposedById: request.imposed_by_id,
  })
  await imposeRestrictionsSequentially(targets, request, imposeRestriction, index + 1)
}
