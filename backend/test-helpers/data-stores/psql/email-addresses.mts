import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

// @data-stores/psql cannot depend on @voucha/test-helpers (see users.mts in this directory for why).
// Trimmed, package-local substitute for test-helpers' isPrimaryEmailForUser.
export async function isLocalPrimaryEmailForUser(userId: string, email: string): Promise<boolean> {
  const { rows } = await read(
    sql`/* isLocalPrimaryEmailForUser */
    SELECT 1 FROM user_email_addresses
    WHERE user_id = ${userId} AND email_address = ${email} AND is_primary = TRUE
    LIMIT 1
  `,
  )
  return rows.length > 0
}

export async function addLocalSecondaryEmailsForUser(
  userId: string,
  emails: string[],
): Promise<void> {
  await write(sql`/* addLocalSecondaryEmailsForUser */
    INSERT INTO user_email_addresses (user_id, email_address, email_domain_hostname_id, is_primary)
    SELECT ${userId}, email_address, domain.id, FALSE
    FROM UNNEST(${emails}::text[]) requested(email_address)
    JOIN url_hostnames domain ON domain.hostname = 'voucha.ai'
  `)
}

export async function countLocalEmailsForUser(userId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countLocalEmailsForUser */
    SELECT COUNT(*)::integer AS count FROM user_email_addresses WHERE user_id = ${userId}
  `)
  return rows[0]!.count
}
