/**
 * amazon_ses_bounce_events entity helpers
 */

import { read } from '../fixture-executor.mts'
import sql from '../fixture-sql.mts'

/**
 * Count amazon_ses_bounce_events rows for a given SES mail.messageId. Used to assert
 * exactly one row lands after a duplicate SQS delivery of the same notification.
 */
export async function countSesBounceEventsBySesMessageId(sesMessageId: string): Promise<number> {
  const { rows } = await read(sql`/* countSesBounceEventsBySesMessageId */
    SELECT count(*)::int AS count
    FROM amazon_ses_bounce_events
    WHERE amazon_ses_message_id = ${sesMessageId}
  `)
  return (rows[0]?.count as number | undefined) ?? 0
}
