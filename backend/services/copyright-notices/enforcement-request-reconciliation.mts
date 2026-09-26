import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { recoverMissingDecisionAssessments } from './enforcement-recovery.mts'
import {
  queryCopyrightSweepIdPage,
  type CopyrightSweepIdPage,
  type CopyrightSweepPageOptions,
} from './sweep-id-pages.mts'

/**
 * Pages the pending and stale claimed enforcement requests, keyed by the immutable assessment ID
 * that `processCopyrightEnforcementRequest` claims.
 */
export function searchReconcilableCopyrightEnforcementRequestIds(
  options: CopyrightSweepPageOptions = {},
): Promise<CopyrightSweepIdPage> {
  return queryCopyrightSweepIdPage(
    options,
    'Invalid copyright enforcement request cursor',
    'enforcementAssessment',
    sql`/* searchReconcilableCopyrightEnforcementRequestIds */
      SELECT copyright_notice_submission_assessment_id AS id
      FROM copyright_notice_enforcement_requests
      WHERE (state = 'pending'
        OR (state = 'claimed' AND claimed_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'))`,
    statement => write(statement),
  )
}

/**
 * Recreates decision assessments and enforcement requests that a post-commit interruption lost, so
 * the next enforcement page walk sees every durable compliant notice decision.
 */
export async function createMissingCopyrightEnforcementRequests(): Promise<void> {
  await recoverMissingDecisionAssessments()
  await write(sql`/* createMissingCopyrightEnforcementRequests */
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
