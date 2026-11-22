import { beginTransaction, write } from '@data-stores/psql'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import sql from 'sql-template-strings'
import {
  processUserDeletionBatch,
  type UserDeletionAttempt,
} from '../../services/user-deletions/index.mts'
import { getUserDeletionRequestForTest } from '../services/user-deletions/user-deletion-lifecycle.mts'
import { processUserDeletionPhaseBatch } from '../../services/users/delete-phases.mts'
import { cleanupOrphanedUserAgentStrings } from '../../services/data-retention/cleanup-user-agent-strings.mts'

export async function insertTestBallotWithPersonalData(input: {
  id: string
  userId: string
  postId: string
  agentKey?: string
}) {
  await using query = await beginTransaction()
  const agent = await upsertUserAgentString(`Synthetic late ballot ${input.agentKey ?? input.id}`, {
    query,
  })
  if (!agent) throw new Error('Expected a test ballot user agent')
  await query(sql`/* insertTestBallotWithPersonalData */ INSERT INTO post_votes
    (id, user_id, post_id, score, ip_address, device_id, session_id, user_agent_string_id)
    VALUES (${input.id}, ${input.userId}, ${input.postId}, 1, '192.0.2.137'::inet,
      uuidv7(), uuidv7(), ${agent})`)
  await query.commit()
  return agent
}

export async function getTestOwnedPostBallots(userIds: string[], postIds: string[]) {
  const { rows } = await write<{
    id: string
    has_personal_data: boolean
  }>(sql`/* getTestOwnedPostBallots */
    SELECT id, ip_address IS NOT NULL AND device_id IS NOT NULL
      AND session_id IS NOT NULL AND user_agent_string_id IS NOT NULL AS has_personal_data
    FROM post_votes WHERE user_id = ANY(${userIds}::uuid[]) AND post_id = ANY(${postIds}::uuid[])
    ORDER BY id LIMIT 20`)
  return rows
}

export async function createTestPostCategory(postId: string, topicId: string) {
  const { rows } = await write<{ id: string }>(
    sql`/* createTestPostCategory */ INSERT INTO relation__post__category__topic (subject_id, object_id)
    VALUES (${postId}, ${topicId}) RETURNING id`,
  )
  return rows[0]!.id
}

export async function pruneTestCompletedDeletionRecord(userId: string) {
  const result = await write(sql`/* pruneTestCompletedDeletionRecord */
    DELETE FROM user_deletion_requests WHERE user_id = ${userId} AND completed_at IS NOT NULL`)
  return result.rowCount
}

export async function cleanupTestBallotUserAgents(ids: string[]) {
  const ageCutoff = new Date(Date.now() + 2 * 24 * 60 * 60 * 1_000)
  await cleanupOrphanedUserAgentStrings(ids.length, ids, ageCutoff)
  const { rows } = await write<{ id: string }>(sql`/* readTestBallotUserAgents */
    SELECT id FROM user_agent_strings WHERE id = ANY(${ids}::uuid[]) ORDER BY id`)
  return rows.map(row => row.id)
}

export async function advanceTestDeletionToFinalize(
  initial: UserDeletionAttempt,
): Promise<UserDeletionAttempt> {
  let attempt = initial
  for (let delivery = 0; delivery < 32; delivery++) {
    const request = await getUserDeletionRequestForTest(attempt.requestId)
    if (request?.currentPhase === 'finalize') return attempt
    const successor = await processUserDeletionBatch(
      attempt.requestId,
      attempt.processingAttemptId,
      {
        processPhaseBatch: processUserDeletionPhaseBatch,
      },
    )
    if (!successor) throw new Error('User deletion completed before the finalization fixture')
    attempt = successor
  }
  throw new Error('User deletion did not reach finalization within the fixture cap')
}
