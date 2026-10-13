import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readCopyrightEmailAncestorIds(replyIntakeId: string): Promise<string[]> {
  const { rows } = await read<{ ancestor_message_intake_id: string }>(
    sql`/* readCopyrightEmailAncestorIds */
      SELECT ancestor_message_intake_id FROM copyright_notice_email_message_ancestors
      WHERE reply_message_intake_id = ${replyIntakeId}
      ORDER BY ancestor_message_intake_id`,
  )
  return rows.map(row => row.ancestor_message_intake_id)
}
