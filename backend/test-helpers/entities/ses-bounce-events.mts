/**
 * ses_bounce_events entity helpers
 */

import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Count ses_bounce_events rows for a given SES mail.messageId. Used to assert
 * exactly one row lands after a duplicate SQS delivery of the same notification.
 */
export async function countSesBounceEventsBySesMessageId(sesMessageId: string): Promise<number> {
  const { rows } = await read(sql`/* countSesBounceEventsBySesMessageId */
    SELECT count(*)::int AS count
    FROM ses_bounce_events
    WHERE ses_message_id = ${sesMessageId}
  `)
  return (rows[0]?.count as number | undefined) ?? 0
}
