import sql, { type SQLStatement } from 'sql-template-strings'

export type CopyrightMinimalPurgePhase = {
  table: string
  statement: (noticeId: string, pageSize: number) => SQLStatement
}

export const COPYRIGHT_MINIMAL_PURGE_PHASES_6: readonly CopyrightMinimalPurgePhase[] = [
  {
    table: 'copyright_notice_correspondence_messages',
    statement: (
      noticeId,
      pageSize,
    ) => sql`/* drainCopyrightMinimal_copy_n_correspondence_messages */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_correspondence_messages child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_correspondence_messages target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_deadlines',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_deadlines */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_deadlines child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_deadlines target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_restrictions',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_restrictions */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_restrictions child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_restrictions target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_submission_assessments',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_submission_assessments */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_submission_assessments child

      WHERE child.copyright_notice_id = ${noticeId}
        AND NOT EXISTS (SELECT 1 FROM copyright_notice_submission_assessments newer WHERE newer.supersedes_assessment_id = child.id)
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_submission_assessments target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_targets',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_targets */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_targets child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_targets target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_form_screenings',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_form_screenings */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_form_screenings child
      JOIN copyright_notice_form_intakes p0 ON child.copyright_notice_form_intake_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_form_screenings target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_form_intakes',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_form_intakes */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_form_intakes child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_form_intakes target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_submissions',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_submissions */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_submissions child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_submissions target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_guest_capabilities',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_guest_capabilities */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_guest_capabilities child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_guest_capabilities target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
]
