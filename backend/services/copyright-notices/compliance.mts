import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import type {
  CopyrightNoticeSubmissionAssessmentRecord,
  CopyrightNoticeSubmissionRecord,
  CopyrightSubmissionKind,
  CopyrightSubmissionSourceKind,
} from './types.mts'

export async function appendCopyrightNoticeSubmission(input: {
  noticeId: string
  kind: CopyrightSubmissionKind
  receivedAt: Date
  sourceKind: CopyrightSubmissionSourceKind
  submittedByUserId: string | null
  bodyCiphertext: string
}): Promise<CopyrightNoticeSubmissionRecord> {
  await using transaction = await beginTransaction()
  const { rows } =
    await transaction<CopyrightNoticeSubmissionRecord>(sql`/* appendCopyrightNoticeSubmission */
    INSERT INTO copyright_notice_submissions (
      copyright_notice_id, kind, received_at, source_kind, submitted_by_user_id, body_ciphertext
    ) VALUES (
      ${input.noticeId}, ${input.kind}, ${input.receivedAt}, ${input.sourceKind}, ${input.submittedByUserId}, ${input.bodyCiphertext}
    )
    RETURNING id, copyright_notice_id, kind, received_at, source_kind, submitted_by_user_id, body_ciphertext
  `)
  const submission = rows[0]
  assert(submission, 500, 'Failed to append copyright notice submission')
  await transaction.commit()
  return submission
}

export async function appendCopyrightSubmissionAssessment(input: {
  submissionId: string
  assessedAt: Date
  currentUser: PrivateUser | null
  substantiallyCompliant: boolean
  supersedesAssessmentId?: string | null
  targetIds?: string[]
}): Promise<CopyrightNoticeSubmissionAssessmentRecord> {
  assert(
    input.currentUser === null || currentUserCanReviewCopyrightNotices(input.currentUser),
    403,
    'Forbidden',
  )
  await using transaction = await beginTransaction()
  const { rows: submissionRows } = await transaction<{
    copyright_notice_id: string
    kind: CopyrightSubmissionKind
    source_kind: CopyrightSubmissionSourceKind
  }>(sql`/* appendCopyrightSubmissionAssessment:lockSubmission */
    SELECT s.copyright_notice_id, s.kind, s.source_kind
    FROM copyright_notice_submissions s
    JOIN copyright_notices n ON n.id = s.copyright_notice_id
    WHERE s.id = ${input.submissionId}
    FOR UPDATE OF n, s
  `)
  assert(submissionRows[0], 404, 'Copyright submission not found')
  assert(
    submissionRows[0].source_kind === 'signed_in_form' || input.currentUser !== null,
    403,
    'Email and guest-form assessments require a copyright reviewer',
  )
  assert(
    submissionRows[0].kind !== 'counter_notice' ||
      !input.substantiallyCompliant ||
      (input.targetIds?.length ?? 0) > 0,
    422,
    'A counter-notice assessment requires at least one requested restoration target',
  )
  assert(
    submissionRows[0].kind === 'counter_notice' || input.targetIds === undefined,
    422,
    'Only counter-notice assessments may specify restoration targets',
  )
  assert(
    input.targetIds === undefined || new Set(input.targetIds).size === input.targetIds.length,
    422,
    'Counter-notice assessment targets must be unique',
  )
  const { rows: currentRows } = await transaction<{
    id: string
  }>(sql`/* appendCopyrightSubmissionAssessment:current */
    SELECT a.id
    FROM copyright_notice_submission_assessments a
    WHERE a.copyright_notice_submission_id = ${input.submissionId}
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_submission_assessments newer
        WHERE newer.supersedes_assessment_id = a.id
      )
    FOR UPDATE OF a
  `)
  const current = currentRows[0]
  assert(
    input.supersedesAssessmentId ? current?.id === input.supersedesAssessmentId : !current,
    409,
    'Assessment must extend the current assessment tip',
  )
  const { rows } = await transaction(sql`/* appendCopyrightSubmissionAssessment */
    INSERT INTO copyright_notice_submission_assessments (
      copyright_notice_submission_id, assessed_at, assessed_by_id, substantially_compliant,
      supersedes_assessment_id
    ) VALUES (
      ${input.submissionId}, ${input.assessedAt}, ${input.currentUser?.id ?? null}, ${input.substantiallyCompliant},
      ${input.supersedesAssessmentId ?? null}
    )
    RETURNING id, copyright_notice_submission_id, assessed_at, assessed_by_id, substantially_compliant,
      supersedes_assessment_id
  `)
  const assessment = rows[0] as CopyrightNoticeSubmissionAssessmentRecord | undefined
  assert(assessment, 500, 'Failed to append copyright submission assessment')
  if (input.targetIds) {
    const { rows: scopedTargets } = await transaction<{ id: string }>(
      sql`/* appendCopyrightSubmissionAssessment:scopeCounterNoticeTargets */
      INSERT INTO copyright_notice_counter_notice_assessment_targets (
        copyright_notice_submission_assessment_id, copyright_notice_target_id
      )
      SELECT ${assessment.id}, target.id
      FROM copyright_notice_targets target
      WHERE target.copyright_notice_id = ${submissionRows[0].copyright_notice_id}
        AND target.id = ANY(${input.targetIds})
      RETURNING copyright_notice_target_id AS id
    `,
    )
    assert(
      scopedTargets.length === input.targetIds.length,
      422,
      'Counter-notice assessment target not found in this case',
    )
  }
  if (input.supersedesAssessmentId) {
    await transaction(sql`/* appendCopyrightSubmissionAssessment:cancelDeadline */
      UPDATE copyright_notice_deadlines
      SET cancelled_at = ${input.assessedAt}
      WHERE qualifying_counter_notice_assessment_id IN (
        SELECT id
        FROM copyright_notice_submission_assessments
        WHERE copyright_notice_submission_id = ${input.submissionId}
      )
        AND resolved_at IS NULL AND cancelled_at IS NULL
    `)
  }
  await transaction(sql`/* appendCopyrightSubmissionAssessment:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, actor_user_id, metadata)
    VALUES (${submissionRows[0].copyright_notice_id}, 'submission_assessed', ${input.currentUser?.id ?? null}, '{}'::jsonb)
  `)
  await transaction.commit()
  return assessment
}
