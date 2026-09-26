import { beginTransaction, read, type TransactionQuery, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { hardDeleteTestPost } from './posts-deletion.mts'

export async function countTestBlueskyLinkAuthorizationsForUser(userId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count
    FROM bluesky_link_authorizations
    WHERE user_id = ${userId}
  `)
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
): Promise<{ release(): void; completed: Promise<void> }> {
  return startPausedTestUserDeletionWriter(async query => {
    await query(sql`/* startPausedTestUserSoftDeletion:lock */
      SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))
    `)
    await query(sql`/* startPausedTestUserSoftDeletion:delete */
      UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${userId}
    `)
  })
}

export async function countTestUserDeletionEntityRelationVotes(userId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count
    FROM entity_relation_votes
    WHERE user_id = ${userId}
  `)
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

export async function insertTestUserDeletionPostVotes(
  userId: string,
  postId: string,
  count: number,
): Promise<void> {
  await write(sql`
    INSERT INTO post_votes (user_id, post_id, score)
    SELECT ${userId}, ${postId}, 1
    FROM generate_series(1, ${count})
  `)
}

export async function countTestUserDeletionPostVotes(userId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count
    FROM post_votes
    WHERE user_id = ${userId}
  `)
  return rows[0]?.count ?? 0
}

export async function insertTestUserDeletionLists(userId: string, count: number): Promise<void> {
  await write(sql`
    INSERT INTO lists (owner_user_id, name, created_via)
    SELECT ${userId}, 'deletion batch list ' || ordinality, 'system'
    FROM generate_series(1, ${count}) WITH ORDINALITY AS generated(value, ordinality)
  `)
}

export async function countTestUserDeletionActiveLists(userId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count
    FROM lists
    WHERE owner_user_id = ${userId}
      AND removed_at IS NULL
  `)
  return rows[0]?.count ?? 0
}

export async function insertTestUserDeletionFollowPostRelations(
  userId: string,
  postIds: string[],
): Promise<void> {
  await write(sql`
    INSERT INTO relation__user__follow__post (subject_id, object_id)
    SELECT ${userId}, post_id
    FROM UNNEST(${postIds}::uuid[]) AS post_id
  `)
}

export async function countTestUserDeletionFollowPostRelations(userId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count
    FROM relation__user__follow__post
    WHERE subject_id = ${userId}
  `)
  return rows[0]?.count ?? 0
}

export async function rotateTestUserDeletionAttemptDuringProviderCall(
  requestId: string,
  successorAttemptId: string,
): Promise<void> {
  await write(sql`
    UPDATE user_deletion_requests
    SET processing_attempt_id = ${successorAttemptId},
        processing_started_at = NULL
    WHERE id = ${requestId}
  `)
}

export async function isTestUserDeletionExternalWorkCompleted(requestId: string): Promise<boolean> {
  const { rows } = await read<{ completed: boolean }>(sql`
    SELECT completed_at IS NOT NULL AS completed
    FROM user_deletion_external_works
    WHERE request_id = ${requestId}
  `)
  return rows[0]?.completed ?? false
}

export async function getTestUserDeletionExternalWorkKeys(
  requestId: string,
  workKind: 's3-export',
): Promise<string[]> {
  const { rows } = await read<{ work_key: string }>(sql`
    SELECT work_key
    FROM user_deletion_external_works
    WHERE request_id = ${requestId} AND work_kind = ${workKind}
    ORDER BY work_key
  `)
  return rows.map(row => row.work_key)
}
