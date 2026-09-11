import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

// Lightweight eligibility gate for inbound ActivityPub processing: whether a user id resolves to
// an active user who has opted into federation. Deliberately returns a single boolean rather than
// a full PrivateUser — inbound-activity dispatch handles untrusted remote input and should not
// pull PII into memory just to decide whether to accept a Follow.
export async function isFederationEnabledForUser(
  userId: string,
  options: QueryOptions = {},
): Promise<boolean> {
  const run = options.query ?? read
  const { rows } = await run<{
    fediverse_federation_enabled: boolean
  }>(sql`/* isFederationEnabledForUser */
    SELECT fediverse_federation_enabled
    FROM users
    WHERE id = ${userId}
      AND deleted_at IS NULL
      AND is_system = FALSE
  `)
  return rows[0]?.fediverse_federation_enabled ?? false
}
