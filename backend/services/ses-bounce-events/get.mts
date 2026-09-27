import sql from 'sql-template-strings'
import { read } from '@data-stores/psql'

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim()
  const { rows } = await read(sql`/* isEmailSuppressed */
    SELECT 1
    FROM ses_bounce_events
    JOIN ses_bounce_event_recipients recipient
      ON recipient.ses_bounce_event_id = ses_bounce_events.id
    WHERE recipient.email = ${normalizedEmail}
      AND (
        (notification_type = 'bounce' AND bounce_type = 'permanent')
        OR notification_type = 'complaint'
      )
    LIMIT 1
  `)
  return rows.length > 0
}
