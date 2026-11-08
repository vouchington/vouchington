import type { QueryExecutor } from '@data-stores/psql'
import { recordMembershipChanges } from './changes.mts'

export type MembershipExpiration = {
  membershipId: string
  membershipSourceId: string
  membershipGrantId: string
  membershipProductId: string
  expiredAt: Date
}

/** The caller bounds this batch to one user's paused grants. */
export async function recordMembershipExpirations(
  userId: string,
  expirations: readonly MembershipExpiration[],
  query: QueryExecutor,
): Promise<void> {
  await recordMembershipChanges(
    expirations.map(row => ({
      membershipId: row.membershipId,
      userId,
      membershipSourceId: row.membershipSourceId,
      membershipGrantId: row.membershipGrantId,
      changeType: 'expiration',
      fromSkuId: row.membershipProductId,
      expiredAt: row.expiredAt,
    })),
    { query },
  )
}
