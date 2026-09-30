import { withSessionAdvisoryLock } from '@services/session-advisory-lock'

/** Serializes the handler-level idempotency decision without sharing the persistence lock key. */
export function withElectionVoteRequestLock<Result>(
  entityType: string,
  userId: string,
  entityId: string,
  handler: () => Promise<Result>,
): Promise<Result> {
  return withSessionAdvisoryLock(handler, {
    lockSql: '/* lockElectionVoteRequest */ SELECT pg_advisory_lock(hashtextextended($1, 0))',
    unlockSql:
      '/* unlockElectionVoteRequest */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
    values: [`vote-request:${entityType}:${userId}:${entityId}`],
    unlockNotHeldMessage: 'Election vote request lock was not held',
    whenOperationAndUnlockFail: 'attach-unlock-error-as-cause',
  })
}
