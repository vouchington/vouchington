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

export type TestBallotSweepCursor = {
  family: string
  cursor_owner_id: string | null
  cursor_entity_id: string | null
  cursor_ballot_id: string | null
  sweep_upper_bound_id: string | null
}

/** Atomically replaces the singleton sweep cursor, so a concurrent sweep cannot collide. */
export async function seedTestBallotSweepCursor(cursor: TestBallotSweepCursor) {
  await write(sql`/* seedTestBallotSweepCursor */
    INSERT INTO deleted_user_ballot_cleanup_cursors
      (family, cursor_owner_id, cursor_entity_id, cursor_ballot_id, sweep_upper_bound_id)
    VALUES (${cursor.family}, ${cursor.cursor_owner_id}, ${cursor.cursor_entity_id},
      ${cursor.cursor_ballot_id}, ${cursor.sweep_upper_bound_id})
    ON CONFLICT (is_singleton) DO UPDATE SET family = EXCLUDED.family,
      cursor_owner_id = EXCLUDED.cursor_owner_id, cursor_entity_id = EXCLUDED.cursor_entity_id,
      cursor_ballot_id = EXCLUDED.cursor_ballot_id,
      sweep_upper_bound_id = EXCLUDED.sweep_upper_bound_id`)
}

export async function readTestBallotSweepCursor() {
  const { rows } = await write<TestBallotSweepCursor>(sql`/* readTestBallotSweepCursor */
    SELECT family, cursor_owner_id, cursor_entity_id, cursor_ballot_id, sweep_upper_bound_id
    FROM deleted_user_ballot_cleanup_cursors WHERE is_singleton`)
  return rows[0] ?? null
}

/** The UUID immediately below `id`, so a sweep resumed after it starts at `id`. */
export function previousTestUuid(id: string) {
  const hex = (BigInt(`0x${id.replaceAll('-', '')}`) - 1n).toString(16).padStart(32, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
