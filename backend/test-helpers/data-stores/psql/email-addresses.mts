import { read } from '../../fixture-executor.mts'
import sql from '../../fixture-sql.mts'

// @data-stores/psql cannot depend on @voucha/test-helpers (see users.mts in this directory for why).
// Trimmed, package-local substitute for test-helpers' isPrimaryEmailForUser.
export async function isLocalPrimaryEmailForUser(userId: string, email: string): Promise<boolean> {
  const { rows } = await read(sql`
    SELECT 1 FROM user_email_addresses
    WHERE user_id = ${userId} AND email_address = ${email} AND is_primary = TRUE
    LIMIT 1
  `)
  return rows.length > 0
}
