import { writeTestImageOwnerRetirement } from './image-owner-retirement.mts'
import { beginTransaction, type QueryExecutor, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createMembershipLockDiagnosticReporter } from './membership-lock-diagnostics.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import type { TestOwnedPostgresWaitOptions } from './postgres-client-lock-identity.mts'


/** Archive a community only after a delegated reply waits on its live row. */
export function withConcurrentCommunityArchiveForTest<T>(
  communityId: string,
  operation: () => Promise<T>,
  queryMarker: string,
): Promise<T> {
  const stageArchive = async (query: QueryExecutor) => {
    await query(sql`/* withConcurrentCommunityArchiveForTest */
      UPDATE communities SET archived_at = CURRENT_TIMESTAMP WHERE id = ${communityId}`)
  }
  if (queryMarker === 'lockCommunityRestrictionWrites') {
    return commitDelegatedWriteChangeThenRun(stageArchive, operation)
  }
  return withConcurrentDelegatedWriteChangeForTest(
    operation,
    queryMarker,
    { kind: 'transaction' },
    stageArchive,
  )
}
/** Commit suspension, then run the writer. Publication writers no longer wait on an author scope lock. */
export function withConcurrentActorSuspensionForTest<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return commitDelegatedWriteChangeThenRun(async query => {
    await query(sql`/* withConcurrentActorSuspensionForTest */
      INSERT INTO user_suspensions (user_id, suspended_by_id) VALUES (${userId}, ${userId})`)
  }, operation)
}

/** Writers no longer take the active-user advisory, so the deletion commits before the write. */
export function withConcurrentActorDeletionForTest<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return commitDelegatedWriteChangeThenRun(async query => {
    await writeTestImageOwnerRetirement(query, { userId }, scopeQuery =>
      scopeQuery(sql`/* withConcurrentActorDeletionForTest */
      UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${userId}`),
    )
  }, operation)
}
/** Revoke membership only after the write waits on its active membership row. */
export function withConcurrentCommunityMembershipRemovalForTest<T>(
  communityId: string,
  userId: string,
  operation: () => Promise<T>,
  queryMarker: string,
): Promise<T> {
  const stageRemoval = async (query: QueryExecutor) => {
    await query(sql`/* withConcurrentCommunityMembershipRemovalForTest */
        UPDATE community_members SET removed_at = CURRENT_TIMESTAMP, removed_by_id = ${userId}
        WHERE community_id = ${communityId} AND user_id = ${userId} AND removed_at IS NULL`)
  }
  if (queryMarker === 'lockCommunityRestrictionWrites.membership') {
    return commitDelegatedWriteChangeThenRun(stageRemoval, operation)
  }
  return withConcurrentDelegatedWriteChangeForTest(
    operation,
    queryMarker,
    { kind: 'transaction' },
    stageRemoval,
    true,
  )
}

/** Commits the staged row, then runs the writer. Used when that writer no longer locks the row. */
async function commitDelegatedWriteChangeThenRun<T>(
  stageChange: (query: TransactionQuery) => Promise<void>,
  operation: () => Promise<T>,
): Promise<T> {
  await using query = await beginTransaction()
  await stageChange(query)
  await query.commit()
  return await operation()
}
/** Commit the staged change only after the mutation is blocked on the exact writer fence. */
async function withConcurrentDelegatedWriteChangeForTest<T>(
  operation: () => Promise<T>,
  queryMarker: string,
  lock: TestOwnedPostgresWaitOptions['lock'],
  stageChange: (query: TransactionQuery) => Promise<void>,
  membershipDiagnostics = false,
): Promise<T> {
  const diagnostics = createMembershipLockDiagnosticReporter(membershipDiagnostics)
  diagnostics.emit('holder-acquire-start')
  await using query = await beginTransaction()
  diagnostics.emit('holder-pid-query-start')
  const processId = await getTestPostgresBackendProcessId(query)
  diagnostics.emit('holder-acquired', `holder_pid=${processId}`)
  await stageChange(query)
  diagnostics.emit('change-staged')
  try {
    return await withTestOwnedPostgresWait(
      {
        holderProcessId: processId,
        pool: 'write',
        lock,
        queryMarker,
        releaseHolder: () => query[Symbol.asyncDispose](),
      },
      async waitForLock => {
        const pending = operation()
        diagnostics.emit('pending-started')
        await waitForLock(pending)
        diagnostics.emit('holder-commit-start')
        await query.commit()
        diagnostics.emit('holder-committed')
        const result = await pending
        diagnostics.emit('operation-settled')
        return result
      },
    )
  } catch (err) {
    diagnostics.emit('failed')
    throw err
  } finally {
    diagnostics.emit('cleanup-complete')
  }
}
