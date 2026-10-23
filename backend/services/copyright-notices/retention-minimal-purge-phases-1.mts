import sql, { type SQLStatement } from 'sql-template-strings'

export type CopyrightMinimalPurgePhase = {
  table: string
  statement: (noticeId: string, pageSize: number) => SQLStatement
}

export const COPYRIGHT_MINIMAL_PURGE_PHASES_1: readonly CopyrightMinimalPurgePhase[] = [
  {
    table: 'ai_agent_call_receipts',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_ai_agent_call_receipts */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM ai_agent_call_receipts child
      JOIN copyright_notice_submissions p0 ON child.copyright_notice_submission_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM ai_agent_call_receipts target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_automatic_withholding_refusals',
    statement: (
      noticeId,
      pageSize,
    ) => sql`/* drainCopyrightMinimal_copy_automatic_withholding_refusals */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_automatic_withholding_refusals child
      JOIN copyright_notice_submissions p0 ON child.copyright_notice_submission_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_automatic_withholding_refusals target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_claimant_misuse_events',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_claimant_misuse_events */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_claimant_misuse_events child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_claimant_misuse_events target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_claimant_suspension_reversals',
    statement: (
      noticeId,
      pageSize,
    ) => sql`/* drainCopyrightMinimal_copy_claimant_suspension_reversals */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_claimant_suspension_reversals child
      JOIN copyright_restrictions p0 ON child.copyright_restriction_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_claimant_suspension_reversals target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_eu_dispute_settlement_outcomes',
    statement: (
      noticeId,
      pageSize,
    ) => sql`/* drainCopyrightMinimal_copy_eu_dispute_settlement_outcomes */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_eu_dispute_settlement_outcomes child
      JOIN copyright_eu_dispute_settlement_referrals p0 ON child.copyright_eu_dispute_settlement_referral_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_eu_dispute_settlement_outcomes target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_legal_hold_restrictions',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_legal_hold_restrictions */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_legal_hold_restrictions child
      JOIN copyright_restrictions p0 ON child.copyright_restriction_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_legal_hold_restrictions target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_action_attempt_results',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_action_attempt_results */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_action_attempt_results child
      JOIN copyright_notice_action_attempts p0 ON child.attempt_id = p0.id JOIN copyright_notice_action_work_items p1 ON p0.work_item_id = p1.id
      WHERE p1.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_action_attempt_results target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_appeal_reviews',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_appeal_reviews */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_appeal_reviews child
      JOIN copyright_restrictions p0 ON child.copyright_restriction_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_appeal_reviews target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_counter_notice_assessment_targets',
    statement: (
      noticeId,
      pageSize,
    ) => sql`/* drainCopyrightMinimal_copy_n_counter_n_assessment_targets */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_counter_notice_assessment_targets child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_counter_notice_assessment_targets target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_counter_notice_reviews',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_counter_n_reviews */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_counter_notice_reviews child
      JOIN copyright_notice_submission_assessments p0 ON child.copyright_notice_submission_assessment_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_counter_notice_reviews target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_delivery_attempt_results',
    statement: (
      noticeId,
      pageSize,
    ) => sql`/* drainCopyrightMinimal_copy_n_delivery_attempt_results */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_delivery_attempt_results child
      JOIN copyright_notice_delivery_attempts p0 ON child.attempt_id = p0.id JOIN copyright_notice_delivery_work_items p1 ON p0.work_item_id = p1.id
      WHERE p1.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_delivery_attempt_results target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
]
