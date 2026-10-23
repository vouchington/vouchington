import sql, { type SQLStatement } from 'sql-template-strings'

export type CopyrightMinimalPurgePhase = {
  table: string
  statement: (noticeId: string, pageSize: number) => SQLStatement
}

export const COPYRIGHT_MINIMAL_PURGE_PHASES_4: readonly CopyrightMinimalPurgePhase[] = [
  {
    table: 'copyright_eu_supervised_complaints',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_eu_supervised_complaints */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_eu_supervised_complaints child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_eu_supervised_complaints target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_action_attempts',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_action_attempts */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_action_attempts child
      JOIN copyright_notice_action_work_items p0 ON child.work_item_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_action_attempts target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_appeal_recommendations',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_appeal_recommendations */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_appeal_recommendations child
      JOIN copyright_notice_submissions p0 ON child.copyright_notice_submission_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_appeal_recommendations target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_delivery_attempts',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_delivery_attempts */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_delivery_attempts child
      JOIN copyright_notice_delivery_work_items p0 ON child.work_item_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_delivery_attempts target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_email_intake_notice_links',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_email_intake_n_links */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_email_intake_notice_links child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_email_intake_notice_links target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_evidence_artifacts',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_evidence_artifacts */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_evidence_artifacts child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_evidence_artifacts target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_form_screening_attempts',
    statement: (
      noticeId,
      pageSize,
    ) => sql`/* drainCopyrightMinimal_copy_n_form_screening_attempts */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_form_screening_attempts child
      JOIN copyright_notice_form_intakes p0 ON child.copyright_notice_form_intake_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_form_screening_attempts target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_legal_hold_resolutions',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_legal_hold_resolutions */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_legal_hold_resolutions child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_legal_hold_resolutions target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_repeat_infringer_incidents',
    statement: (
      noticeId,
      pageSize,
    ) => sql`/* drainCopyrightMinimal_copy_repeat_infringer_incidents */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_repeat_infringer_incidents child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_repeat_infringer_incidents target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_staydown_entries',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_staydown_entries */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_staydown_entries child
      JOIN copyright_restrictions p0 ON child.copyright_restriction_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_staydown_entries target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
]
