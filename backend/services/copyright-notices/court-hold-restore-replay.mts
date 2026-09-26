import { beginTransaction } from '@data-stores/psql'
import { enqueueApplyCopyrightAction } from '@queues/notifications/enqueues'
import sql from 'sql-template-strings'
import { replayCopyrightRestoreActionsForRestrictions } from './action-delivery-state.mts'
import { noticeHasUnassessedCourtOrCcbFiling } from './court-hold-assessment-gate.mts'

/** Reopens restore intents that delivery blocked only because a court or CCB filing
 * had no assessment. Targets a qualifying assessment still covers stay blocked. */
export async function replayRestoresAfterCourtFilingAssessment(noticeId: string): Promise<void> {
  // ast-grep-ignore: no-three-sequential-awaits -- the notice lock must cover the unassessed check and the intent selection, and replay starts only after that transaction commits
  await using transaction = await beginTransaction()
  if (await noticeHasUnassessedCourtOrCcbFiling(noticeId, transaction)) return
  const assessedAt = new Date()
  const { rows } = await transaction<{ restriction_id: string; intent_id: string }>(sql`
    /* replayRestoresAfterCourtFilingAssessment */
    SELECT restriction.id AS restriction_id, intent.id AS intent_id
    FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    JOIN copyright_notice_action_intents intent ON intent.copyright_restriction_id = restriction.id
    WHERE target.copyright_notice_id = ${noticeId}
      AND intent.action = 'restore'
      AND intent.state IN ('blocked', 'failed')
      AND NOT EXISTS (
        SELECT 1
        FROM copyright_notice_legal_hold_assessments hold
        JOIN copyright_notice_submissions submission
          ON submission.id = hold.copyright_notice_submission_id
        JOIN copyright_notice_legal_hold_assessment_targets hold_target
          ON hold_target.copyright_notice_legal_hold_assessment_id = hold.id
          AND hold_target.copyright_notice_target_id = restriction.copyright_notice_target_id
        LEFT JOIN copyright_notice_legal_hold_resolutions resolution
          ON resolution.copyright_notice_legal_hold_assessment_id = hold.id
        WHERE submission.copyright_notice_id = ${noticeId}
          AND resolution.id IS NULL
          AND hold.from_original_claimant
          AND hold.same_material
          AND hold.proceeding_kind IS NOT NULL
          AND hold.commenced_at IS NOT NULL
          AND hold.received_by_designated_agent_at IS NOT NULL
          AND hold.received_by_designated_agent_at <= ${assessedAt}
      )
    FOR UPDATE OF intent
  `)
  await transaction.commit()
  if (rows.length === 0) return
  await replayCopyrightRestoreActionsForRestrictions(rows.map(row => row.restriction_id))
  for (const row of rows) void enqueueApplyCopyrightAction(row.intent_id)
}
