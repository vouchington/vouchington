import { writePool, type PoolClient } from '@data-stores/psql'

export type TestSessionReferralAttributionPairLock = {
  hasWaiter(): Promise<boolean>
  release(): Promise<void>
}

/** Holds the same pair key used by the attribution writer, so integration tests can prove waiting. */
export async function acquireTestSessionReferralAttributionPairLock(
  sessionId: string,
  referrerId: string,
): Promise<TestSessionReferralAttributionPairLock> {
  const client = await writePool.connect()
  const key = sessionReferralAttributionPairKey(sessionId, referrerId)
  try {
    await client.query(
      '/* acquireTestSessionReferralAttributionPairLock */ SELECT pg_advisory_lock(hashtextextended($1, 0))',
      [key],
    )
  } catch (error) {
    client.release(toError(error))
    throw error
  }
  return createTestSessionReferralAttributionPairLock(client, key)
}

function createTestSessionReferralAttributionPairLock(
  client: PoolClient,
  key: string,
): TestSessionReferralAttributionPairLock {
  let released = false
  return {
    async hasWaiter() {
      const result = await client.query<{ waiting: boolean }>(
        `/* testSessionReferralAttributionPairLockHasWaiter */
          SELECT EXISTS (
            SELECT 1 FROM pg_locks
            WHERE locktype = 'advisory'
              AND NOT granted
              AND classid::bigint = ((hashtextextended($1, 0) >> 32) & 4294967295)
              AND objid::bigint = (hashtextextended($1, 0) & 4294967295)
          ) AS waiting`,
        [key],
      )
      return result.rows[0]?.waiting ?? false
    },
    async release() {
      if (released) return
      released = true
      try {
        const result = await client.query<{ unlocked: boolean }>(
          '/* releaseTestSessionReferralAttributionPairLock */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
          [key],
        )
        if (!result.rows[0]?.unlocked) {
          throw new Error('Session referral attribution pair test lock was not held')
        }
        client.release()
      } catch (error) {
        client.release(toError(error))
        throw error
      }
    },
  }
}

function sessionReferralAttributionPairKey(sessionId: string, referrerId: string): string {
  return `session-referral-attribution:${sessionId}:${referrerId}`
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
