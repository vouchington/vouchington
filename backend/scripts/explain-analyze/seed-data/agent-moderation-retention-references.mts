import { write } from '@data-stores/psql'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'
import type { AgentModerationRetentionRow } from './agent-moderation-retention-rows.mts'

const DAY_MS = 24 * 60 * 60 * 1_000
const BATCH_SIZE = 2_000
const SYSTEM_USER_ID = seedUuid(0, '01')
const FEEDBACK_ID = seedUuid(2_000_000, '48')
const VOTE_FLAG_ID = seedUuid(2_000_000, '49')
const ACTION_ID = seedUuid(2_000_000, '4a')
const VOTE_ID = seedUuid(2_000_000, '4b')

export async function insertAgentModerationRetentionReferenceNoise(
  oldStartMs: number,
  rowCount: number,
): Promise<void> {
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const timestampMs = postSeedTimestampMs(0) - 30 * DAY_MS + index
    return {
      id: seedUuidAtTimestamp(timestampMs, 2_100_000 + index),
      timestampMs,
      postId: seedUuid(10_200 + index, '05'),
      moderationId: seedUuidAtTimestamp(oldStartMs + (10_100 + index) * 2, 10_100 + index),
      userId: seedUuid(index, '01'),
    }
  })

  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE)
    const ids = batch.map(row => row.id)
    const postIds = batch.map(row => row.postId)
    const moderationIds = batch.map(row => row.moderationId)
    // no-mistakes-disable-next-line query-reached-per-item: fixed reference cohorts use bounded batches and must populate each FK-backed table
    await write(
      `/* seedAgentModerationRetentionReferenceNoise */
       INSERT INTO moderation_training_feedbacks
         (id, source_type, event_type, label, human_action, post_id, agent_moderation_id)
       SELECT input.id, 'agent_moderation', 'automod_reviewed', 'true_positive', 'keep_removed',
         input.post_id, input.moderation_id
       FROM unnest($1::uuid[], $2::uuid[], $3::uuid[])
         AS input(id, post_id, moderation_id)
       ON CONFLICT (id) DO NOTHING`,
      [ids, postIds, moderationIds],
    )
    // no-mistakes-disable-next-line query-reached-per-item: fixed reference cohorts use bounded batches and must populate each FK-backed table
    await write(
      `/* seedAgentModerationRetentionReferenceNoise */
       INSERT INTO vote_integrity_flags
         (id, agent_moderation_post_id, agent_moderation_id, flag_type)
       SELECT input.id, input.post_id, input.moderation_id, 'ip_correlation'
       FROM unnest($1::uuid[], $2::uuid[], $3::uuid[])
         AS input(id, post_id, moderation_id)
       ON CONFLICT (id) DO NOTHING`,
      [ids, postIds, moderationIds],
    )
    // no-mistakes-disable-next-line query-reached-per-item: fixed reference cohorts use bounded batches and must populate each FK-backed table
    await write(
      `/* seedAgentModerationRetentionReferenceNoise */
       INSERT INTO agent_moderation_votes
         (id, user_id, agent_moderation_id, post_id, score)
       SELECT input.id, input.user_id, input.moderation_id, input.post_id, 1
       FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[])
         AS input(id, user_id, moderation_id, post_id)
       ON CONFLICT (agent_moderation_id, id) DO NOTHING`,
      [
        batch.map((row, index) => seedUuidAtTimestamp(row.timestampMs, 2_200_000 + start + index)),
        batch.map(row => row.userId),
        moderationIds,
        postIds,
      ],
    )
    // no-mistakes-disable-next-line query-reached-per-item: fixed reference cohorts use bounded batches and must populate each FK-backed table
    await write(
      `/* seedAgentModerationRetentionReferenceNoise */
       INSERT INTO moderator_actions
         (id, action_type, agent_moderation_post_id, agent_moderation_id)
       SELECT input.id, 'agent_moderation_vote_set', input.post_id, input.moderation_id
       FROM unnest($1::uuid[], $2::uuid[], $3::uuid[])
         AS input(id, post_id, moderation_id)
       ON CONFLICT (id) DO NOTHING`,
      [
        batch.map((row, index) => seedUuidAtTimestamp(row.timestampMs, 2_300_000 + start + index)),
        postIds,
        moderationIds,
      ],
    )
  }
}

export async function insertAgentModerationRetentionReferences(
  reference: AgentModerationRetentionRow,
): Promise<void> {
  await write(
    `/* seedAgentModerationRetentionReferences */
     INSERT INTO moderation_training_feedbacks
       (id, source_type, event_type, label, human_action, post_id, agent_moderation_id)
     VALUES ($1::uuid, 'agent_moderation', 'automod_reviewed', 'true_positive', 'keep_removed',
       $2::uuid, $3::uuid)
     ON CONFLICT (id) DO NOTHING`,
    [FEEDBACK_ID, reference.postId, reference.id],
  )
  await write(
    `/* seedAgentModerationRetentionReferences */
     INSERT INTO vote_integrity_flags
       (id, agent_moderation_post_id, agent_moderation_id, flag_type)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'ip_correlation')
     ON CONFLICT (id) DO NOTHING`,
    [VOTE_FLAG_ID, reference.postId, reference.id],
  )
  await write(
    `/* seedAgentModerationRetentionReferences */
     INSERT INTO agent_moderation_votes
       (id, user_id, agent_moderation_id, post_id, score)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 1)
     ON CONFLICT (agent_moderation_id, id) DO NOTHING`,
    [VOTE_ID, SYSTEM_USER_ID, reference.id, reference.postId],
  )
  await write(
    `/* seedAgentModerationRetentionReferences */
     INSERT INTO moderator_actions
       (id, action_type, agent_moderation_post_id, agent_moderation_id)
     VALUES ($1::uuid, 'agent_moderation_vote_set', $2::uuid, $3::uuid)
     ON CONFLICT (id) DO NOTHING`,
    [ACTION_ID, reference.postId, reference.id],
  )
}
