import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightRestrictionRecord } from './types.mts'

export async function acceptCopyrightNoticeAndImposeRestriction(input: {
  noticeId: string
  targetId: string
  assessmentId: string
  imposedAt: Date
  imposedById: string | null
}): Promise<CopyrightRestrictionRecord> {
  await using transaction = await beginTransaction()
  const { rows: targetRows } = await transaction<{ placement_key: string }>(
    sql`/* acceptCopyrightNoticeAndImposeRestriction:findTarget */
    SELECT placement_key
    FROM copyright_notice_targets
    WHERE id = ${input.targetId} AND copyright_notice_id = ${input.noticeId}
  `,
  )
  const target = targetRows[0]
  assert(target, 404, 'Copyright notice target not found')
  await transaction(sql`/* acceptCopyrightNoticeAndImposeRestriction:placementAdvisoryLock */
    SELECT pg_advisory_xact_lock(hashtextextended(${target.placement_key}, 0))
  `)
  const { rows: noticeRows } = await transaction<{ id: string }>(
    sql`/* acceptCopyrightNoticeAndImposeRestriction:lockNotice */
    SELECT id FROM copyright_notices WHERE id = ${input.noticeId} FOR UPDATE
  `,
  )
  assert(noticeRows[0], 404, 'Copyright notice not found')
  const { rows: lockedTargets } = await transaction<{ id: string }>(
    sql`/* acceptCopyrightNoticeAndImposeRestriction:lockTarget */
    SELECT id
    FROM copyright_notice_targets
    WHERE id = ${input.targetId}
      AND copyright_notice_id = ${input.noticeId}
      AND placement_key = ${target.placement_key}
    FOR UPDATE
  `,
  )
  assert(lockedTargets[0], 409, 'Copyright notice target changed while being restricted')
  const { rows: assessmentRows } = await transaction<{
    source_kind: 'signed_in_form' | 'guest_form' | 'email' | 'staff'
    assessed_by_id: string | null
    substantially_compliant: boolean
  }>(sql`/* acceptCopyrightNoticeAndImposeRestriction:lockAssessment */
    SELECT submission.source_kind, assessment.assessed_by_id, assessment.substantially_compliant
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
  `)
  const assessment = assessmentRows[0]
  assert(assessment, 422, 'A current notice assessment is required before restriction')
  assert(assessment.substantially_compliant, 422, 'Copyright notice assessment is not compliant')
  assert(
    assessment.source_kind === 'signed_in_form' || assessment.assessed_by_id !== null,
    422,
    'Guest and email copyright notices require a human moderator assessment',
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
      copyright_notice_target_id, authorizing_assessment_id, imposed_at, imposed_by_id
    ) VALUES (${input.targetId}, ${input.assessmentId}, ${input.imposedAt}, ${input.imposedById})
    ON CONFLICT (copyright_notice_target_id) WHERE lifted_at IS NULL DO NOTHING
    RETURNING id, copyright_notice_target_id, authorizing_assessment_id, imposed_at, lifted_at, imposed_by_id, lifted_by_id,
      human_reviewed_at, human_review_action, human_reviewed_by_id
  `)
  const restriction = rows[0]
  assert(restriction, 409, 'An active copyright restriction already exists for this target')
  await transaction(sql`/* acceptCopyrightNoticeAndImposeRestriction:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, actor_user_id, metadata)
    VALUES (${input.noticeId}, 'provisional_restriction_imposed', ${input.imposedById}, '{}'::jsonb)
  `)
  await transaction.commit()
  return restriction
}
