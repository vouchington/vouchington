import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Noninitial links leave one at a time after their private child paths. */
export const COPYRIGHT_CASE_EMAIL_LINK_DELETE_TABLE = 'copyright_notice_email_intake_notice_links'

/** One exclusive thread link and its private intake, after its child pages drained. */
export async function deleteCopyrightCaseEmailThreadLinkPage(
  query: TransactionQuery,
  noticeId: string,
): Promise<boolean> {
  const { rows } = await query<{ link_id: string; intake_id: string }>(sql`
    /* readCopyrightCaseEmailThreadLinkPage */
    SELECT link.id AS link_id, intake.id AS intake_id
    FROM copyright_notice_email_intake_notice_links link
    JOIN copyright_notice_email_intakes intake
      ON intake.id = link.copyright_notice_email_intake_id
    WHERE link.copyright_notice_id = ${noticeId}::uuid AND link.link_kind = 'thread'
    ORDER BY link.id LIMIT 1 FOR UPDATE OF link, intake NOWAIT`)
  const row = rows[0]
  if (!row) return false
  // ast-grep-ignore: no-three-sequential-awaits -- the transaction-local table permit must precede each FK-ordered DELETE and changes between the link and intake.
  await query(sql`/* scopeCopyrightCaseEmailThreadLink */
    SELECT set_config('app.copyright_case_purge_notice_id', ${noticeId}, true),
      set_config('app.copyright_case_purge_table', ${COPYRIGHT_CASE_EMAIL_LINK_DELETE_TABLE}, true)`)
  await query(sql`/* deleteCopyrightCaseEmailThreadLink */
    DELETE FROM copyright_notice_email_intake_notice_links
    WHERE id = ${row.link_id}::uuid AND copyright_notice_id = ${noticeId}::uuid`)
  await query(sql`/* scopeCopyrightCaseEmailThreadIntake */
    SELECT set_config('app.copyright_case_purge_table', 'copyright_notice_email_intakes', true)`)
  await query(sql`/* permitCopyrightCaseEmailThreadIntakeDelete */
    SET LOCAL app.copyright_operational_retention = 'on'`)
  await query(sql`/* deleteCopyrightCaseEmailThreadIntake */
    DELETE FROM copyright_notice_email_intakes WHERE id = ${row.intake_id}::uuid`)
  return true
}
