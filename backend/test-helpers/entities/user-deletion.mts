import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { beginTransaction, read, type TransactionQuery, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { hardDeleteTestPost } from './posts-deletion.mts'
import { getTestPostgresBackendProcessId } from '../postgres-lock-wait.mts'

export async function countTestBlueskyLinkAuthorizationsForUser(userId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(
    allowUnannotatedQuery(sql`
    SELECT COUNT(*)::int AS count
    FROM bluesky_link_authorizations
    WHERE user_id = ${userId}
  `),
  )
  return rows[0]?.count ?? 0
}

export async function startPausedTestUserDeletionWriter(
  writeWithinTransaction: (query: TransactionQuery) => Promise<void>,
): Promise<{ release(): void; completed: Promise<void> }> {
  const inserted = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const completed = (async () => {
    await using query = await beginTransaction()
    await writeWithinTransaction(query)
    inserted.resolve()
    await release.promise
    await query.commit()
  })()
  void completed.catch(inserted.reject)
  await inserted.promise
  return { release: () => release.resolve(), completed }
}

/** Holds the production user-lifecycle lock across an uncommitted soft deletion. */
export async function startPausedTestUserSoftDeletion(
  userId: string,
): Promise<{ completed: Promise<void>; holderProcessId: number; release(): void }> {
  let holderProcessId: number | undefined
  const paused = await startPausedTestUserDeletionWriter(async query => {
    await query(sql`/* startPausedTestUserSoftDeletion:lock */
      SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))
    `)
    holderProcessId = await getTestPostgresBackendProcessId(query)
    await query(sql`/* startPausedTestUserSoftDeletion:delete */
      UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${userId}
    `)
  })
  if (holderProcessId === undefined)
    throw new Error('Test deletion did not acquire a PostgreSQL backend')
  return { ...paused, holderProcessId }
}

export async function countTestUserDeletionEntityRelationVotes(userId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(
    allowUnannotatedQuery(sql`
    SELECT COUNT(*)::int AS count
    FROM view_entity_relation_votes
    WHERE user_id = ${userId}
  `),
  )
  return rows[0]?.count ?? 0
}

export async function withTestDeletionCandidateCascade<T>(
  candidateSqlMarker: string,
  cascade: () => Promise<void>,
  operation: (query: TransactionQuery) => Promise<T>,
): Promise<T> {
  await using transaction = await beginTransaction()
  let cascaded = false
  const query = Object.assign(
    async (sqlInput: Parameters<TransactionQuery>[0], values?: Parameters<TransactionQuery>[1]) => {
      const result = await transaction(sqlInput, values)
      if (!cascaded && typeof sqlInput !== 'string' && sqlInput.text.includes(candidateSqlMarker)) {
        cascaded = true
        await cascade()
      }
      return result
    },
    { client: transaction.client },
  ) as TransactionQuery
  const result = await operation(query)
  if (!cascaded) {
    throw new Error(`Deletion candidate cascade was not triggered for ${candidateSqlMarker}`)
  }
  await transaction.commit()
  return result
}

export async function withTestEntityRelationVoteCandidateCascade<T>(
  cascadePostIdAfterCandidateSelection: string,
  operation: (query: TransactionQuery) => Promise<T>,
): Promise<T> {
  return withTestDeletionCandidateCascade(
    'deleteUserEntityRelationVotesBatch:candidates',
    () => hardDeleteTestPost(cascadePostIdAfterCandidateSelection),
    operation,
  )
}

export async function rotateTestUserDeletionAttemptDuringProviderCall(
  requestId: string,
  successorAttemptId: string,
): Promise<void> {
  await write(
    allowUnannotatedQuery(sql`
    UPDATE user_deletion_requests
    SET processing_attempt_id = ${successorAttemptId},
        processing_started_at = NULL
    WHERE id = ${requestId}
  `),
  )
}

export async function isTestUserDeletionExternalWorkCompleted(requestId: string): Promise<boolean> {
  const { rows } = await read<{ completed: boolean }>(
    allowUnannotatedQuery(sql`
    SELECT completed_at IS NOT NULL AS completed
    FROM user_deletion_external_works
    WHERE request_id = ${requestId}
  `),
  )
  return rows[0]?.completed ?? false
}

export async function getTestUserDeletionExternalWorkKeys(
  requestId: string,
  workKind: 's3-export',
): Promise<string[]> {
  const { rows } = await read<{ work_key: string }>(
    allowUnannotatedQuery(sql`
    SELECT work_key
    FROM user_deletion_external_works
    WHERE request_id = ${requestId} AND work_kind = ${workKind}
    ORDER BY work_key
  `),
  )
  return rows.map(row => row.work_key)
}

export {
  insertTestUserDeletionPostVotes,
  countTestUserDeletionPostVotes,
  insertTestUserDeletionLists,
  countTestUserDeletionActiveLists,
  insertTestUserDeletionFollowPostRelations,
  countTestUserDeletionFollowPostRelations,
} from './user-deletion-batch-fixtures.mts'
