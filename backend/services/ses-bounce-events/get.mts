import sql from 'sql-template-strings'
import { read } from '@data-stores/psql'

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim()
  const { rows } = await read(sql`/* isEmailSuppressed */
    SELECT 1
    FROM ses_bounce_events
    WHERE recipients @> ${JSON.stringify([normalizedEmail])}::jsonb
      AND (
        (notification_type = 'bounce' AND bounce_type = 'permanent')
        OR notification_type = 'complaint'
      )
    LIMIT 1
  `)
  return rows.length > 0
}
