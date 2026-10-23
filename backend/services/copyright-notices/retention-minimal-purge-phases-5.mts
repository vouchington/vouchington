import sql, { type SQLStatement } from 'sql-template-strings'

export type CopyrightMinimalPurgePhase = {
  table: string
  statement: (noticeId: string, pageSize: number) => SQLStatement
}

export const COPYRIGHT_MINIMAL_PURGE_PHASES_5: readonly CopyrightMinimalPurgePhase[] = [
  {
    table: 'copyright_territorial_notice_acknowledgments',
    statement: (
      noticeId,
      pageSize,
    ) => sql`/* drainCopyrightMinimal_copy_territorial_n_acknowledgments */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_territorial_notice_acknowledgments child
      JOIN copyright_territorial_notice_receipts p0 ON child.copyright_territorial_notice_receipt_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_territorial_notice_acknowledgments target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_territorial_redress_requests',
    statement: (
      noticeId,
      pageSize,
    ) => sql`/* drainCopyrightMinimal_copy_territorial_redress_requests */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_territorial_redress_requests child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_territorial_redress_requests target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'notification_push_intents',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_notif_push_intents */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM notification_push_intents child
      JOIN notifications p0 ON child.user_id = p0.user_id AND child.notification_id = p0.id
      WHERE p0.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM notification_push_intents target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_action_work_items',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_action_work_items */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_action_work_items child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_action_work_items target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_delivery_work_items',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_delivery_work_items */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_delivery_work_items child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_delivery_work_items target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_notice_legal_hold_assessments',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_n_legal_hold_assessments */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_notice_legal_hold_assessments child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_notice_legal_hold_assessments target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_territorial_decisions',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_territorial_decisions */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_territorial_decisions child

      WHERE child.copyright_notice_id = ${noticeId}
        AND NOT EXISTS (SELECT 1 FROM copyright_territorial_decisions newer WHERE newer.supersedes_decision_id = child.id)
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_territorial_decisions target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'copyright_territorial_notice_receipts',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_copy_territorial_n_receipts */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM copyright_territorial_notice_receipts child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM copyright_territorial_notice_receipts target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
  {
    table: 'notifications',
    statement: (noticeId, pageSize) => sql`/* drainCopyrightMinimal_notifications */
    WITH candidate AS MATERIALIZED (
      SELECT child.tableoid, child.ctid FROM notifications child

      WHERE child.copyright_notice_id = ${noticeId}
      LIMIT ${pageSize + 1}
    ), page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
    deleted AS (DELETE FROM notifications target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
    SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM deleted)::integer AS deleted`,
  },
]
