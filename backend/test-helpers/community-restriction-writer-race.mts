import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { vi } from 'vitest'
import { lockDelegatedPostCommunity } from '../services/posts/delegated-write-locks.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

/** Keep the delegated community fence until the real restriction writer is blocked on it. */
export async function withHeldDelegatedCommunityFenceForTest<T>(
  communityId: string,
  actorId: string,
  operation: () => Promise<T>,
  options: {
    beforeRelease?: (query: TransactionQuery) => Promise<void>
  } = {},
): Promise<T> {
  await using query = await beginTransaction()
  await lockDelegatedPostCommunity(query, communityId, actorId)
  const processId = await getTestPostgresBackendProcessId(query)
  return await withTestOwnedPostgresWait(
    {
      holderProcessId: processId,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker: '/* lockCommunityRestrictionWrites */',
      releaseHolder: () => query[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = operation()
      await waitForLock(pending)
      await options.beforeRelease?.(query)
      await query.commit()
      return pending
    },
  )
}

/** Expire one fixture-owned restriction while its community writer is held at the fence. */
export async function expireTestCommunityRestrictionWhileFenceHeld(
  query: TransactionQuery,
  communityId: string,
  restrictionId: string,
): Promise<void> {
  const { rows } = await query<{
    id: string
  }>(sql`/* expireTestCommunityRestrictionWhileFenceHeld */
    UPDATE community_restrictions
    SET expires_at = statement_timestamp() - INTERVAL '1 second'
    WHERE community_id = ${communityId} AND id = ${restrictionId}
    RETURNING id
  `)
  if (rows.length !== 1) {
    throw new Error('Expected to expire exactly one fixture-owned community restriction')
  }
}

/** Simulate application clock skew without changing PostgreSQL or real lock-wait timers. */
export async function withCommunityRestrictionApplicationClockForTest<T>(
  at: Date,
  operation: () => Promise<T>,
): Promise<T> {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(at)
  try {
    return await operation()
  } finally {
    vi.useRealTimers()
  }
}
