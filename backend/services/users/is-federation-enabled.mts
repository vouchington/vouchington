import { read, type QueryExecutor, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

// Lightweight eligibility gate for inbound ActivityPub processing: whether a user id resolves to
// an active user who has opted into federation. Deliberately returns a single boolean rather than
// a full PrivateUser — inbound-activity dispatch handles untrusted remote input and should not
// pull PII into memory just to decide whether to accept a Follow.
export async function isFederationEnabledForUser(
  userId: string,
  options: QueryOptions = {},
): Promise<boolean> {
  const run = (execute: QueryExecutor) =>
    execute<{
      is_fediverse_federation_enabled: boolean
    }>(sql`/* isFederationEnabledForUser */
    SELECT is_fediverse_federation_enabled
    FROM users
    WHERE id = ${userId}
      AND deleted_at IS NULL
      AND platform_account_kind IS NULL
  `)
  const { rows } = await run(options.query ?? read)
  return rows[0]?.is_fediverse_federation_enabled ?? false
}
