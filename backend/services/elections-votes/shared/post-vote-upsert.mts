import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ElectionVoteMutationResult, ElectionVoteScore, VoteEventContext } from './types.mts'

type PostVoteInput = {
  userId: string
  entityId: string
  score: ElectionVoteScore
  scoreIsNeutral: boolean
  scoreIsSemantic: boolean
}

/** The unique current ballot arbitrates both API votes and automatic creator votes. */
export async function insertPostElectionVoteRows(
  userId: string,
  values: PostVoteInput[],
  context: VoteEventContext,
  userAgentId: string | null,
  run: QueryExecutor,
): Promise<ElectionVoteMutationResult[]> {
  const { rows } = await run(sql`/* upsertElectionVotesShared */
    -- MATERIALIZED only so the volatile uuidv7() runs once per row.
    WITH input_data AS MATERIALIZED (
      SELECT raw.*, uuidv7() AS id FROM UNNEST(
        ${values.map(value => value.entityId)}::uuid[],
        ${values.map(value => value.score)}::smallint[],
        ${values.map(value => value.scoreIsNeutral)}::boolean[],
        ${values.map(value => value.scoreIsSemantic)}::boolean[]
      ) AS raw(post_id, score, score_is_neutral, score_is_semantic)
    ), transitioned AS (
      INSERT INTO post_vote_states AS state
        (post_id, user_id, id, score, score_is_neutral, score_is_semantic,
         outbound_activitypub_like_activity_id)
      SELECT input.post_id, ${userId}::uuid, input.id, input.score,
        input.score_is_neutral, input.score_is_semantic,
        CASE WHEN input.score > 0 THEN input.id ELSE NULL END
      FROM input_data input
      WHERE EXISTS (SELECT 1 FROM users WHERE id = ${userId}::uuid AND deleted_at IS NULL)
        AND (input.score IS NOT NULL OR EXISTS (
          SELECT 1 FROM post_vote_states WHERE post_id = input.post_id AND user_id = ${userId}::uuid
        ))
      ORDER BY input.post_id
      ON CONFLICT (post_id, user_id) DO UPDATE
      SET id = EXCLUDED.id, score = EXCLUDED.score,
        score_is_neutral = EXCLUDED.score_is_neutral,
        score_is_semantic = EXCLUDED.score_is_semantic,
        outbound_activitypub_like_activity_id = CASE WHEN EXCLUDED.score > 0 THEN
          CASE WHEN state.score > 0 THEN state.outbound_activitypub_like_activity_id
            ELSE EXCLUDED.id END
          ELSE NULL END
      WHERE state.score IS DISTINCT FROM EXCLUDED.score
        OR state.score_is_neutral IS DISTINCT FROM EXCLUDED.score_is_neutral
        OR state.score_is_semantic IS DISTINCT FROM EXCLUDED.score_is_semantic
      RETURNING WITH (OLD AS previous, NEW AS current)
        current.post_id, current.user_id, current.id, current.score,
        current.score_is_neutral, current.score_is_semantic,
        current.outbound_activitypub_like_activity_id,
        previous.score AS previous_score,
        previous.outbound_activitypub_like_activity_id AS previous_outbound_ap_like_activity_id
    ), inserted AS (
      INSERT INTO post_votes (post_id, user_id, id, score, score_is_neutral, score_is_semantic,
        ip_address, device_id, session_id, user_agent_string_id,
        outbound_activitypub_like_activity_id, outbound_activitypub_original_like_activity_id)
      SELECT current.post_id, current.user_id, current.id, current.score,
        current.score_is_neutral, current.score_is_semantic,
        ${context.ipAddress}::inet, ${context.deviceId}::uuid, ${context.sessionId}::uuid,
        ${userAgentId}::uuid, current.outbound_activitypub_like_activity_id,
        CASE WHEN current.score IS NULL OR current.score <= 0 THEN
          CASE WHEN current.previous_score > 0 THEN current.previous_outbound_ap_like_activity_id
            ELSE NULL END
          ELSE NULL END
      FROM transitioned current
      RETURNING post_id AS entity_id, id, user_id, score, created_at,
        outbound_activitypub_like_activity_id
    )
    SELECT inserted.*, current.previous_score, current.previous_outbound_ap_like_activity_id
    FROM inserted JOIN transitioned current ON current.post_id = inserted.entity_id
    ORDER BY inserted.entity_id
  `)
  return rows as ElectionVoteMutationResult[]
}
