import sql, { type SQLStatement } from 'sql-template-strings'

/**
 * Opens a `queue_key` CTE with one row per actionable case: the case's urgency tier (0 missed
 * deadline, 1 deadline past escalation, 2 other work), the oldest open item's `waiting_since`,
 * and its distinct `reasons`. Callers append their own `SELECT ... FROM queue_key`.
 */
export function copyrightStaffQueueKeysSql(): SQLStatement {
  return sql`
    WITH open_item AS (
      SELECT intake.copyright_notice_id, 'form_intake_review'::text AS reason,
        submission.received_at AS since
      FROM copyright_notice_form_intakes intake
      JOIN copyright_notice_submissions submission ON submission.id = intake.copyright_notice_submission_id
      LEFT JOIN copyright_notice_form_intake_reviews review ON review.copyright_notice_form_intake_id = intake.id
      WHERE review.id IS NULL
        AND (submission.source_kind = 'guest_form' OR NOT EXISTS (
          SELECT 1 FROM copyright_notice_form_screening_executions execution
          JOIN copyright_notice_submission_assessments assessment
            ON assessment.copyright_notice_submission_id = submission.id
              AND assessment.copyright_notice_form_screening_id = execution.copyright_notice_form_screening_id
          WHERE execution.copyright_notice_form_intake_id = intake.id
            AND fn_current_copyright_form_screening(submission.id, execution.copyright_notice_form_screening_id)
            AND assessment.substantially_compliant AND NOT EXISTS (
              SELECT 1 FROM copyright_notice_submission_assessments newer
              WHERE newer.supersedes_assessment_id = assessment.id
            )
        ))
      UNION ALL
      SELECT target.copyright_notice_id, 'restriction_review', restriction.imposed_at
      FROM copyright_restrictions restriction
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE restriction.lifted_at IS NULL AND restriction.human_reviewed_at IS NULL
      UNION ALL
      SELECT submission.copyright_notice_id, 'appeal_review', submission.received_at
      FROM copyright_notice_submissions submission
      WHERE submission.kind = 'appeal' AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_appeal_reviews review
        WHERE review.copyright_notice_submission_id = submission.id
      )
      UNION ALL
      SELECT submission.copyright_notice_id, 'counter_notice_review', submission.received_at
      FROM copyright_notice_submissions submission
      WHERE submission.kind = 'counter_notice' AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_counter_notice_reviews review
        WHERE review.copyright_notice_submission_id = submission.id
      )
      UNION ALL
      SELECT submission.copyright_notice_id, 'legal_hold_review', submission.received_at
      FROM copyright_notice_submissions submission
      LEFT JOIN copyright_notice_legal_hold_assessments assessment
        ON assessment.copyright_notice_submission_id = submission.id
      LEFT JOIN copyright_notice_legal_hold_resolutions resolution
        ON resolution.copyright_notice_legal_hold_assessment_id = assessment.id
      WHERE submission.kind = 'court_or_ccb_hold'
        AND (assessment.id IS NULL OR (
          resolution.id IS NULL
          AND assessment.from_original_claimant
          AND assessment.proceeding_kind IS NOT NULL
          AND assessment.commenced_at IS NOT NULL
          AND assessment.received_by_designated_agent_at IS NOT NULL
          AND assessment.same_material
        ))
      UNION ALL
      SELECT target.copyright_notice_id, 'action_failed', intent.updated_at
      FROM copyright_notice_action_intents intent
      JOIN copyright_restrictions restriction ON restriction.id = intent.copyright_restriction_id
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE intent.state = 'failed'
      UNION ALL
      SELECT request.copyright_notice_id, 'enforcement_pending', request.created_at
      FROM copyright_notice_enforcement_requests request
      WHERE request.state <> 'completed'
      UNION ALL
      SELECT intent.copyright_notice_id, 'delivery_failed',
        COALESCE(intent.bounced_at, intent.failed_at, intent.updated_at)
      FROM copyright_notice_delivery_intents intent
      WHERE intent.state IN ('failed', 'bounced') AND intent.copyright_notice_id IS NOT NULL
      UNION ALL
      SELECT deadline.copyright_notice_id,
        CASE WHEN deadline.restoration_deadline_at <= CURRENT_TIMESTAMP
          THEN 'deadline_missed' ELSE 'deadline_due' END,
        deadline.escalation_at
      FROM copyright_notice_deadlines deadline
      WHERE deadline.resolved_at IS NULL AND deadline.cancelled_at IS NULL
        AND deadline.escalation_at <= CURRENT_TIMESTAMP
    ), queue_key AS (
      SELECT open_item.copyright_notice_id AS id,
        CASE
          WHEN bool_or(open_item.reason = 'deadline_missed') THEN 0
          WHEN bool_or(open_item.reason = 'deadline_due') THEN 1
          ELSE 2
        END AS urgency,
        min(open_item.since) AS waiting_since,
        array_agg(DISTINCT open_item.reason ORDER BY open_item.reason) AS reasons
      FROM open_item
      GROUP BY open_item.copyright_notice_id
    )
  `
}
