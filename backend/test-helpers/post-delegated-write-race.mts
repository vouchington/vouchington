import {
  advisoryLockPool,
  beginTransaction,
  type OwnedTransaction,
  type QueryExecutor,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createMembershipLockDiagnosticReporter } from './membership-lock-diagnostics.mts'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from './postgres-lock-wait.mts'

/** Hold the canonical writer fence while a delegated mutation passes its old public preflight. */
export function withConcurrentPostPrivacyChangeForTest<T>(
  postId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withConcurrentDelegatedWriteChangeForTest(
    operation,
    'lockPostPublicationCaptures',
    async query => {
      await query(sql`/* withConcurrentPostPrivacyChangeForTest.fence */
        SELECT pg_advisory_xact_lock(hashtextextended(${`post:${postId.toLowerCase()}`}, 0))`)
      await query(sql`/* withConcurrentPostPrivacyChangeForTest */
        UPDATE posts SET privacy = 'private', broadcast = 'users' WHERE id = ${postId}`)
    },
  )
}
/** Commit a disabled community type only after creation reaches its settings row fence. */
export function withConcurrentCommunityReviewDisableForTest<T>(
  communityId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withConcurrentDelegatedWriteChangeForTest(
    operation,
    'lockDelegatedPostCommunity',
    async query => {
      await query(sql`/* withConcurrentCommunityReviewDisableForTest */
        UPDATE communities SET should_allow_review_posts = false WHERE id = ${communityId}`)
    },
  )
}
/** Delete a community only after a delegated thread write waits on its live row. */
export function withConcurrentCommunityDeletionForTest<T>(
  communityId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withConcurrentDelegatedWriteChangeForTest(
    operation,
    'lockDelegatedPostCommunity',
    async query => {
      await query(sql`/* withConcurrentCommunityDeletionForTest */
        UPDATE communities SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${communityId}`)
    },
  )
}

/** Archive a community only after a delegated reply waits on its live row. */
export function withConcurrentCommunityArchiveForTest<T>(
  communityId: string,
  operation: () => Promise<T>,
  queryMarker = 'lockDelegatedPostCommunity',
): Promise<T> {
  return withConcurrentDelegatedWriteChangeForTest(operation, queryMarker, async query => {
    await query(sql`/* withConcurrentCommunityArchiveForTest */
        UPDATE communities SET archived_at = CURRENT_TIMESTAMP WHERE id = ${communityId}`)
  })
}
/** Commit suspension after a delegated write reaches the canonical author lifecycle fence. */
export function withConcurrentActorSuspensionForTest<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withConcurrentDelegatedWriteChangeForTest(
    operation,
    'lockPostPublicationScope',
    async query => {
      await query(sql`/* withConcurrentActorSuspensionForTest.fence */
        SELECT pg_advisory_xact_lock(hashtextextended(${`author:${userId.toLowerCase()}`}, 0))`)
      await query(sql`/* withConcurrentActorSuspensionForTest */
        INSERT INTO user_suspensions (user_id, suspended_by_id) VALUES (${userId}, ${userId})`)
    },
  )
}

/** Commit deletion only after a delegated create waits on the active-user mutation fence. */
export function withConcurrentActorDeletionForTest<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withConcurrentDelegatedWriteChangeForTest(
    operation,
    'lockActiveUserSubjectsForMutation',
    async query => {
      await query(sql`/* withConcurrentActorDeletionForTest.fence */
        SELECT pg_advisory_xact_lock(hashtextextended(${userId.toLowerCase()}, 0))`)
      await query(sql`/* withConcurrentActorDeletionForTest */
        UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${userId}`)
    },
  )
}
/** Revoke membership only after the write waits on its active membership row. */
export function withConcurrentCommunityMembershipRemovalForTest<T>(
  communityId: string,
  userId: string,
  operation: () => Promise<T>,
  queryMarker = 'lockDelegatedPostCommunity.membership',
): Promise<T> {
  return withConcurrentDelegatedWriteChangeForTest(
    operation,
    queryMarker,
    async query => {
      await query(sql`/* withConcurrentCommunityMembershipRemovalForTest */
          UPDATE community_members SET removed_at = CURRENT_TIMESTAMP, removed_by_id = ${userId}
          WHERE community_id = ${communityId} AND user_id = ${userId} AND removed_at IS NULL`)
    },
    true,
  )
}
/** Commit the staged change only after the mutation is blocked on the exact writer fence. */
async function withConcurrentDelegatedWriteChangeForTest<T>(
  operation: () => Promise<T>,
  queryMarker: string,
  stageChange: (query: QueryExecutor) => Promise<void>,
  membershipDiagnostics = false,
): Promise<T> {
  const diagnostics = createMembershipLockDiagnosticReporter(membershipDiagnostics)
  diagnostics.emit('observer-acquire-start')
  const observer = await beginTransaction({ client: advisoryLockPool })
  diagnostics.emit('observer-acquired')
  let query: OwnedTransaction | undefined
  let pending: Promise<T> | undefined
  let result: T | undefined
  let failure: { reason: unknown } | undefined
  const cleanupErrors: unknown[] = []
  let settlementAttempted = false
  try {
    diagnostics.emit('holder-acquire-start')
    query = await beginTransaction()
    diagnostics.emit('holder-pid-query-start')
    const processId = await getTestPostgresBackendProcessId(query)
    diagnostics.emit('holder-acquired', `holder_pid=${processId}`)
    await stageChange(query)
    diagnostics.emit('change-staged')
    pending = operation()
    void pending.catch(() => undefined)
    diagnostics.emit('pending-started')
    await waitForTestPostgresLockWaiter(
      processId,
      queryMarker,
      observer,
      membershipDiagnostics ? diagnostics.observeWait : undefined,
    )
    settlementAttempted = true
    diagnostics.emit('holder-commit-start')
    await query.commit()
    diagnostics.emit('holder-committed')
    result = await pending
    diagnostics.emit('operation-settled')
  } catch (err) {
    diagnostics.emit('failed')
    failure = { reason: err }
  } finally {
    if (query && !settlementAttempted) {
      try {
        await query.rollback()
      } catch (err) {
        cleanupErrors.push(err)
      }
    }
    try {
      await query?.[Symbol.asyncDispose]()
    } catch (err) {
      cleanupErrors.push(err)
    }
    try {
      await observer[Symbol.asyncDispose]()
    } catch (err) {
      cleanupErrors.push(err)
    }
    if (pending) {
      try {
        await pending
      } catch (err) {
        if (!failure) failure = { reason: err }
        else if (!Object.is(err, failure.reason)) cleanupErrors.push(err)
      }
    }
  }
  diagnostics.emit('cleanup-complete')
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      [...(failure ? [failure.reason] : []), ...cleanupErrors],
      'Delegated write race cleanup failed',
    )
  }
  if (failure) throw failure.reason
  return result as T
}
