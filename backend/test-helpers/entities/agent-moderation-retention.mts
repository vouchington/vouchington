import { read, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestAgent } from './agents.mts'
import { createTestUserDirect } from './users-direct.mts'
import { insertTestAgentPrompt } from './post-llm-moderation-prompts.mts'
import { insertTestPost } from './posts.mts'

export async function setTestPostCurrentModerationInputHashFromResult(
  postId: string,
  moderationId: string,
  query: QueryExecutor = write,
): Promise<void> {
  await query(sql`/* setTestPostCurrentModerationInputHashFromResult */
    UPDATE posts SET llm_moderation_content_sha256 = (
      SELECT input_sha256 FROM agent_moderations
      WHERE post_id = ${postId}::uuid AND id = ${moderationId}::uuid
    ) WHERE id = ${postId}::uuid
  `)
}

export async function testAgentModerationExists(postId: string, id: string): Promise<boolean> {
  const { rows } = await read(sql`/* testAgentModerationExists */
    SELECT 1 FROM agent_moderations WHERE post_id = ${postId}::uuid AND id = ${id}::uuid
  `)
  return rows.length > 0
}

export async function testAgentModerationRetentionPostHasWork(
  postId: string,
  query: QueryExecutor = read,
): Promise<boolean> {
  const { rows } = await query(sql`/* testAgentModerationRetentionPostHasWork */
    SELECT 1 FROM agent_moderation_retention_post_work_items WHERE post_id = ${postId}::uuid
  `)
  return rows.length > 0
}

export async function getTestAgentModerationRetentionPostCursor(
  postId: string,
  query: QueryExecutor = read,
): Promise<string | null> {
  const { rows } = await query<{ cursor_moderation_record_id: string }>(
    sql`/* getTestAgentModerationRetentionPostCursor */
      SELECT cursor_moderation_record_id FROM agent_moderation_retention_post_work_items
      WHERE post_id = ${postId}::uuid`,
  )
  return rows[0]?.cursor_moderation_record_id ?? null
}

export async function setTestAgentModerationRetentionHashBlocked(
  postId: string,
  moderationIds: string[],
  query: QueryExecutor = write,
): Promise<void> {
  await query(sql`/* setTestAgentModerationRetentionHashBlocked */
    UPDATE agent_moderations SET retention_due_at = NULL, retention_blocked_reason = 'hash'
    WHERE post_id = ${postId}::uuid AND id = ANY(${moderationIds}::uuid[])
  `)
}

export async function getTestAgentModerationRetentionHashBlockedIds(
  postId: string,
  query: QueryExecutor = read,
): Promise<string[]> {
  const { rows } = await query<{ id: string }>(
    sql`/* getTestAgentModerationRetentionHashBlockedIds */
      SELECT id FROM agent_moderations
      WHERE post_id = ${postId}::uuid AND retention_blocked_reason = 'hash'
      ORDER BY id`,
  )
  return rows.map(row => row.id)
}

export async function insertTestAgentModerationRetentionPostWork(
  postIds: string[],
  changedAt: Date,
  query: QueryExecutor = write,
): Promise<void> {
  await query(sql`/* insertTestAgentModerationRetentionPostWork */
    INSERT INTO agent_moderation_retention_post_work_items (post_id, changed_at)
    SELECT input.post_id, ${changedAt}::timestamptz
    FROM unnest(${postIds}::uuid[]) AS input(post_id)
  `)
}

export async function attachTestAgentModerationAuditReference(
  postId: string,
  id: string,
): Promise<void> {
  await write(sql`/* attachTestAgentModerationAuditReference */
    INSERT INTO moderator_actions(action_type, agent_moderation_post_id, agent_moderation_id)
    VALUES ('agent_moderation_vote_set', ${postId}::uuid, ${id}::uuid)
  `)
}

export async function deleteTestAgentModerationAuditReference(
  postId: string,
  id: string,
): Promise<void> {
  await write(sql`/* deleteTestAgentModerationAuditReference */
    DELETE FROM moderator_actions
    WHERE agent_moderation_post_id = ${postId}::uuid
      AND agent_moderation_id = ${id}::uuid
  `)
}

export async function attachTestAgentModerationTrainingReference(
  postId: string,
  id: string,
): Promise<void> {
  await write(sql`/* attachTestAgentModerationTrainingReference */
    INSERT INTO moderation_training_feedbacks
      (source_type, event_type, label, human_action, post_id, agent_moderation_id)
    VALUES ('agent_moderation', 'automod_reviewed', 'true_positive', 'keep_removed',
      ${postId}::uuid, ${id}::uuid)
  `)
}

export async function deleteTestAgentModerationTrainingReference(
  postId: string,
  id: string,
): Promise<void> {
  await write(sql`/* deleteTestAgentModerationTrainingReference */
    DELETE FROM moderation_training_feedbacks
    WHERE post_id = ${postId}::uuid AND agent_moderation_id = ${id}::uuid
  `)
}

export async function attachTestAgentModerationFlagReference(
  postId: string,
  id: string,
): Promise<void> {
  await write(sql`/* attachTestAgentModerationFlagReference */
    INSERT INTO vote_integrity_flags
      (flag_type, agent_moderation_post_id, agent_moderation_id)
    VALUES ('velocity_spike', ${postId}::uuid, ${id}::uuid)
  `)
}

export async function deleteTestAgentModerationFlagReference(
  postId: string,
  id: string,
): Promise<void> {
  await write(sql`/* deleteTestAgentModerationFlagReference */
    DELETE FROM vote_integrity_flags
    WHERE agent_moderation_post_id = ${postId}::uuid AND agent_moderation_id = ${id}::uuid
  `)
}

export async function attachTestAgentModerationVoteReference(
  postId: string,
  id: string,
  userId: string,
): Promise<void> {
  await write(sql`/* attachTestAgentModerationVoteReference */
    INSERT INTO agent_moderation_votes
      (post_id, agent_moderation_id, user_id, score)
    VALUES (${postId}::uuid, ${id}::uuid, ${userId}::uuid, 1)
  `)
}

export async function deleteTestAgentModerationVoteReference(
  postId: string,
  id: string,
): Promise<void> {
  await write(sql`/* deleteTestAgentModerationVoteReference */
    DELETE FROM agent_moderation_votes
    WHERE post_id = ${postId}::uuid AND agent_moderation_id = ${id}::uuid
  `)
}

export async function releaseTestAgentModerationTransparencyDay(occurredAt: Date): Promise<void> {
  const day = occurredAt.toISOString().slice(0, 10)
  await write(sql`/* releaseTestAgentModerationTransparencyDay */
    SELECT fn_release_moderation_transparency_daily_rollup(
      ${day}::date, NULL::uuid, 'automated_moderation', 'agent_moderation',
      ${new Date(occurredAt.getTime() + 86_400_000)}::timestamptz)
  `)
}

export async function createTestAgentModerationRetentionFixture() {
  const author = await createTestUserDirect()
  const agent = await createTestAgent({ activated: true })
  const promptId = await insertTestAgentPrompt({ agentId: agent.id })
  const postId = await insertTestPost({
    createdById: author.id,
    slug: `agent-retention-${crypto.randomUUID()}`,
    title: 'Agent retention fixture',
    markdown: 'Synthetic moderation input',
  })
  return { agentId: agent.id as string, promptId, postId }
}
