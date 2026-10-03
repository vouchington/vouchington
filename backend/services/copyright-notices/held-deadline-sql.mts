import sql, { type SQLStatement } from 'sql-template-strings'
import { unassessedCourtFilingSql } from './unassessed-court-filing-sql.mts'

/** A deadline is held only while every still-restricted assessed target has a qualifying hold. */
export function heldCopyrightDeadlineSql(): SQLStatement {
  const restrictedTargets = sql`
    SELECT deadline_target.copyright_notice_target_id
    FROM copyright_notice_counter_notice_assessment_targets deadline_target
    WHERE deadline_target.copyright_notice_submission_assessment_id = deadline.qualifying_counter_notice_assessment_id
      AND EXISTS (
        SELECT 1 FROM copyright_restrictions active_restriction
        WHERE active_restriction.copyright_notice_target_id = deadline_target.copyright_notice_target_id
          AND active_restriction.lifted_at IS NULL
      )`
  return sql`(NOT `
    .append(unassessedCourtFilingSql(sql``.append('deadline.copyright_notice_id')))
    .append(sql` AND EXISTS (`)
    .append(restrictedTargets)
    .append(sql`)
      AND NOT EXISTS (`)
    .append(restrictedTargets).append(sql`
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_legal_hold_assessments hold
          JOIN copyright_notice_submissions filing ON filing.id = hold.copyright_notice_submission_id
          JOIN copyright_notice_legal_hold_assessment_targets hold_target
            ON hold_target.copyright_notice_legal_hold_assessment_id = hold.id
          LEFT JOIN copyright_notice_legal_hold_resolutions resolution
            ON resolution.copyright_notice_legal_hold_assessment_id = hold.id
          WHERE filing.copyright_notice_id = deadline.copyright_notice_id
            AND hold_target.copyright_notice_target_id = deadline_target.copyright_notice_target_id
            AND resolution.id IS NULL AND hold.from_original_claimant AND hold.same_material
            AND hold.proceeding_kind IS NOT NULL AND hold.commenced_at IS NOT NULL
            AND hold.received_by_designated_agent_at IS NOT NULL
            AND hold.received_by_designated_agent_at <= hold.assessed_at
        )
      ))`)
}
