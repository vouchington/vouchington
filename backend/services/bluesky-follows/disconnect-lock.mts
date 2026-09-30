import { withSessionAdvisoryLock } from '@services/session-advisory-lock'

// PostgreSQL's two-int advisory keys are structurally disjoint from the one-bigint keys used by
// Bluesky's user/DID transaction locks. This session lock spans provider I/O performed on other
// pooled connections, so sharing their key space could self-deadlock.
export const BLUESKY_DISCONNECT_LOCK_NAMESPACE = 0x4253

export async function withBlueskyDisconnectLock<Result>(
  userId: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  return withSessionAdvisoryLock(operation, {
    lockSql: '/* withBlueskyDisconnectLock:lock */ SELECT pg_advisory_lock($1, hashtext($2))',
    unlockSql:
      '/* withBlueskyDisconnectLock:unlock */ SELECT pg_advisory_unlock($1, hashtext($2)) AS unlocked',
    values: [BLUESKY_DISCONNECT_LOCK_NAMESPACE, userId],
    unlockNotHeldMessage: 'Bluesky disconnect advisory lock was not held at release',
    whenOperationAndUnlockFail: 'report-unlock-error',
  })
}
