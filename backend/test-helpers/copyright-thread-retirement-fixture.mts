import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Completed, owned graph retirement for subsequent admission and replay probes. */
export async function seedCommittedCopyrightThreadRetirement(
  noticeId: string,
  intakeIds: string[],
) {
  const upper = intakeIds.toSorted().at(-1)
  if (!upper) throw new Error('A retired thread fixture needs its complete owned intake cohort')
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedCommittedCopyrightThreadRetirement:enable */
    SELECT set_config('app.copyright_operational_retention', 'on', true)`)
  const { rowCount } = await transaction(sql`/* seedCommittedCopyrightThreadRetirement:marker */
    INSERT INTO copyright_notice_email_thread_retirements (copyright_notice_id, retired_before_intake_bound)
    VALUES (${noticeId}, ${upper}::uuid)`)
  if (rowCount !== 1) throw new Error('Owned retirement marker missing')
  await transaction(sql`/* seedCommittedCopyrightThreadRetirement:matched */
    UPDATE copyright_notice_email_intake_notice_links SET matched_token_id = NULL
    WHERE copyright_notice_id = ${noticeId}
      AND copyright_notice_email_intake_id = ANY(${intakeIds}::uuid[])
      AND matched_token_id IS NOT NULL`)
  await transaction(sql`/* seedCommittedCopyrightThreadRetirement:references */
    DELETE FROM copyright_notice_email_thread_references reference
    USING copyright_notice_email_intake_notice_links link
    WHERE reference.copyright_notice_email_intake_id = link.copyright_notice_email_intake_id
      AND link.copyright_notice_id = ${noticeId}
      AND reference.copyright_notice_email_intake_id = ANY(${intakeIds}::uuid[])`)
  await transaction(sql`/* seedCommittedCopyrightThreadRetirement:edges */
    DELETE FROM copyright_notice_email_message_ancestors
    WHERE reply_message_intake_receipt_id = ANY(${intakeIds}::uuid[])
      AND ancestor_message_intake_receipt_id = ANY(${intakeIds}::uuid[])`)
  await transaction.commit()
}
