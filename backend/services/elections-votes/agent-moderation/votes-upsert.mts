import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueBulkUpdateAgentModerationElectionVoteStats } from '@queues/elections/enqueues'
import type {
  ElectionVoteMutationResult,
  ElectionVoteScore,
  VoteEventContext,
} from '../shared/index.mts'
import { upsertVoteUserAgent } from '../shared/upsert-vote-user-agent.mts'

const NULL_VOTE_CONTEXT: VoteEventContext = {
  ipAddress: null,
  deviceId: null,
  sessionId: null,
  userAgent: null,
}

async function lockAgentModerationVoteMutation(
  query: TransactionQuery,
  userId: string,
  agentModerationIds: string[],
): Promise<void> {
  await query(sql`/* lockActiveUserForAgentModerationElectionVoteMutation */
    SELECT fn_lock_active_user_for_mutation(${userId}::uuid)
  `)
  await query(sql`/* lockAgentModerationElectionVoteMutations */
    SELECT pg_advisory_xact_lock(
      hashtextextended('agent_moderation_votes:' || ${userId} || ':' || ordered.entity_id::text, 0)
    )
    FROM (
      SELECT unnest(${agentModerationIds}::uuid[]) AS entity_id
      ORDER BY entity_id
    ) ordered
  `)
}

export async function upsertAgentModerationElectionVotes(
  userId: string,
  votes: Array<{ entityId: string; score: ElectionVoteScore }>,
  context: VoteEventContext = NULL_VOTE_CONTEXT,
  onVote?: (vote: ElectionVoteMutationResult, query: TransactionQuery) => Promise<void>,
): Promise<ElectionVoteMutationResult[]> {
  if (votes.length === 0) return []

  const valuesByEntityId = new Map<
    string,
    { userId: string; agentModerationId: string; score: ElectionVoteScore }
  >()
  for (const vote of votes) {
    valuesByEntityId.set(vote.entityId, {
      userId,
      agentModerationId: vote.entityId,
      score: vote.score,
    })
  }
  const values = [...valuesByEntityId.values()]
  // Sort by agentModerationId for deterministic index-lock acquisition order (prevents ABBA deadlocks).
  values.sort((a, b) => a.agentModerationId.localeCompare(b.agentModerationId))

  // Upsert user agent into lookup table if provided (counts as the 1st of 2 allowed DB calls)
  const userAgentId = await upsertVoteUserAgent(context.userAgent)

  await using query = await beginTransaction()
  await lockAgentModerationVoteMutation(
    query,
    userId,
    values.map(vote => vote.agentModerationId),
  )
  const result = await query(sql`/* upsertAgentModerationElectionVotes */
  WITH input_votes AS (
    SELECT *
    FROM UNNEST(
      ${values.map(v => v.userId)}::uuid[],
      ${values.map(v => v.agentModerationId)}::uuid[],
      ${values.map(v => v.score)}::integer[]
    ) AS v(user_id, agent_moderation_id, score)
  ), previous_votes AS (
    SELECT DISTINCT ON (agent_moderation_id) agent_moderation_id, score
    FROM agent_moderation_votes
    WHERE user_id = ${userId}
      AND agent_moderation_id = ANY(${values.map(vote => vote.agentModerationId)}::uuid[])
    ORDER BY agent_moderation_id, id DESC
  )
  INSERT INTO agent_moderation_votes (user_id, agent_moderation_id, post_id, score, ip_address, device_id, session_id, user_agent_id)
  SELECT input_votes.user_id, am.id, am.post_id, input_votes.score,
    ${context.ipAddress}::inet, ${context.deviceId}::uuid, ${context.sessionId}::uuid, ${userAgentId}::uuid
  FROM input_votes
  JOIN agent_moderations am ON am.id = input_votes.agent_moderation_id AND am.deleted_at IS NULL
  LEFT JOIN previous_votes ON previous_votes.agent_moderation_id = input_votes.agent_moderation_id
  WHERE input_votes.score IS DISTINCT FROM previous_votes.score
  ORDER BY input_votes.agent_moderation_id
  RETURNING agent_moderation_id AS entity_id, user_id, score, created_at
  `)
  const inserted = result.rows as ElectionVoteMutationResult[]
  if (onVote) {
    await Promise.all(inserted.map(vote => onVote(vote, query)))
  }
  const rows = inserted

  await query.commit()

  const entityIds = [...valuesByEntityId.keys()]
  // Re-enqueue current no-op retries too: their preceding committed ballot may have outlived a
  // transient aggregate-enqueue failure. The queue boundary reports failures independently.
  void enqueueBulkUpdateAgentModerationElectionVoteStats(entityIds)

  return rows
}
