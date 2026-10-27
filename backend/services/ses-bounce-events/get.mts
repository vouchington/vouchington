import sql from 'sql-template-strings'
import { read } from '@data-stores/psql'

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim()
  const { rows } = await read(sql`/* isEmailSuppressed */
    SELECT 1
    FROM amazon_ses_address_suppressions
    WHERE email_address = ${normalizedEmail}
    LIMIT 1
  `)
  return rows.length > 0
}
