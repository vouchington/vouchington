import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { TerritorialCopyrightJurisdiction } from '../services/copyright-notices/territorial-fields.mts'

/** Advisory-lock key production holds around jurisdiction policy inserts. Tests that fence the
 * same lock must match it, and block or fail if production drifts. */
export function copyrightJurisdictionPolicyLockKey(
  jurisdiction: TerritorialCopyrightJurisdiction,
): string {
  return `copyright-jurisdiction-policy:${jurisdiction}`
}

export async function lockCopyrightJurisdictionPolicy(
  jurisdiction: TerritorialCopyrightJurisdiction,
  query: TransactionQuery,
): Promise<void> {
  const lockKey = copyrightJurisdictionPolicyLockKey(jurisdiction)
  await query(sql`/* lockCopyrightJurisdictionPolicy */
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
  `)
}
