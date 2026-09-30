import { withSessionAdvisoryLock } from '@services/session-advisory-lock'

export const POST_FINALIZATION_LOCK_NAMESPACE = 0x5046

export async function withPostFinalizationLock<Result>(
  postId: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  return withSessionAdvisoryLock(operation, {
    lockSql: '/* withPostFinalizationLock.lock */ SELECT pg_advisory_lock($1, hashtext($2))',
    unlockSql:
      '/* withPostFinalizationLock.unlock */ SELECT pg_advisory_unlock($1, hashtext($2)) AS unlocked',
    values: [POST_FINALIZATION_LOCK_NAMESPACE, postId],
    unlockNotHeldMessage: 'Post finalization advisory lock was not held at release',
    whenOperationAndUnlockFail: 'attach-unlock-error-as-cause',
  })
}
