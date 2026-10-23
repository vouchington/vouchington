import sql, { type SQLStatement } from 'sql-template-strings'

export type CopyrightMinimalPurgePhase = {
  table: string
  statement: (noticeId: string, pageSize: number) => SQLStatement
}

export const COPYRIGHT_MINIMAL_PURGE_PHASES_2: readonly CopyrightMinimalPurgePhase[] = [
  {
    table: 'copyright_notice_delivery_recipients',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_delivery_recipients */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_delivery_recipients child
      JOIN copyright_notice_delivery_work_items p0 ON child.copyright_notice_delivery_work_item_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_delivery_recipients target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_email_correspondence_reviews',
    statement: (
      noticeId,
      pageSize,
    ) => sql`/* drainCopyrightMinimal_copy_n_email_correspondence_reviews */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_email_correspondence_reviews child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_email_correspondence_reviews target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_form_intake_reviews',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_form_intake_reviews */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_form_intake_reviews child
      JOIN copyright_notice_form_intakes p0 ON child.copyright_notice_form_intake_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_form_intake_reviews target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_form_screening_work_items',
    statement: (
      noticeId,
      pageSize,
    ) => sql`/* drainCopyrightMinimal_copy_n_form_screening_work_items */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_form_screening_work_items child
      JOIN copyright_notice_form_intakes p0 ON child.copyright_notice_form_intake_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_form_screening_work_items target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_legal_hold_assessment_targets',
    statement: (
      noticeId,
      pageSize,
    ) => sql`/* drainCopyrightMinimal_copy_n_legal_hold_assessment_targets */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_legal_hold_assessment_targets child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_legal_hold_assessment_targets target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_lifecycle_changes',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_lifecycle_changes */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_lifecycle_changes child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_lifecycle_changes target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_submission_guidance',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_submission_guidance */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_submission_guidance child
      JOIN copyright_notice_submissions p0 ON child.copyright_notice_submission_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_submission_guidance target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_submission_requests',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_submission_requests */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_submission_requests child
      JOIN copyright_notice_submissions p0 ON child.copyright_notice_submission_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_submission_requests target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_submission_targets',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_submission_targets */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_submission_targets child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_submission_targets target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_target_images',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_target_images */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_target_images child
      JOIN copyright_notice_targets p0 ON child.copyright_notice_target_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_target_images target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
]
