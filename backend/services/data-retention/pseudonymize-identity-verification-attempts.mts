import type { TransactionQuery } from '@data-stores/psql/types'
import { DELETED_USER_ID } from '@services/users/constants'
import sql from 'sql-template-strings'

/**
 * Retains the billing/support ledger without retaining a hard-deleted account identifier.
 * The included-attempt uniqueness index excludes the tombstone because multiple purged accounts
 * can have already-consumed included attempts; grant parents retain a non-null tombstone actor.
 */
export async function pseudonymizeIdentityVerificationAttempts(
  query: TransactionQuery,
  targetIds: string[],
): Promise<void> {
  await query(sql`/* pseudonymizeIdentityVerificationAttempts */
    UPDATE identity_verification_attempts
    SET user_id = CASE
          WHEN user_id = ANY(${targetIds}::uuid[]) THEN ${DELETED_USER_ID}
          ELSE user_id
        END,
        granted_by_id = CASE
          WHEN granted_by_id = ANY(${targetIds}::uuid[]) THEN ${DELETED_USER_ID}
          ELSE granted_by_id
        END
    WHERE user_id = ANY(${targetIds}::uuid[])
       OR granted_by_id = ANY(${targetIds}::uuid[])`)
}
