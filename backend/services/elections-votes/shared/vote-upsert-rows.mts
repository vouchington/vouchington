import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  ElectionVoteMutationResult,
  ElectionVoteScore,
  EntityElectionConfig,
  VoteEventContext,
} from './types.mts'

export async function insertElectionVoteRows(
  config: EntityElectionConfig,
  userId: string,
  values: Array<{
    userId: string
    entityId: string
    score: ElectionVoteScore
    scoreIsNeutral: boolean
    scoreIsSemantic: boolean
  }>,
  context: VoteEventContext,
  userAgentId: string | null,
  run: QueryExecutor,
): Promise<ElectionVoteMutationResult[]> {
  // previous_votes reads the pre-statement snapshot (PostgreSQL evaluates every WITH branch
  // against the state as of statement start), so it always reflects this user's latest score
  // before `inserted`'s row lands — never a value from this same call. Folding the lookup into
  // this single write() keeps the function at its 2-call budget instead of a separate read().
  const query = sql`/* upsertElectionVotesShared */
    WITH input_data AS (
      SELECT raw.*, uuidv7() AS id FROM UNNEST(
        ${values.map(v => v.userId)}::uuid[],
        ${values.map(v => v.entityId)}::uuid[],
        ${values.map(v => v.score)}::smallint[],
        ${values.map(() => context.ipAddress)}::inet[],
        ${values.map(() => context.deviceId)}::uuid[],
        ${values.map(() => context.sessionId)}::uuid[],
        ${values.map(() => userAgentId)}::uuid[],
        ${values.map(v => v.scoreIsNeutral)}::boolean[],
        ${values.map(v => v.scoreIsSemantic)}::boolean[]
      ) AS raw(user_id, entity_id, score, ip_address, device_id, session_id, user_agent_string_id, score_is_neutral, score_is_semantic)
    ), previous_votes AS (
      SELECT DISTINCT ON (`

  query.append(config.entityIdColumn)
  query.append(sql`) `)
  query.append(config.entityIdColumn)
  query.append(sql` AS entity_id, score AS previous_score
  `)
  if (config.tracksNeutralScore) {
    query.append(sql`, score_is_neutral AS previous_score_is_neutral`)
  } else {
    query.append(sql`, FALSE AS previous_score_is_neutral`)
  }
  if (config.tracksSemanticScore) {
    query.append(sql`, score_is_semantic AS previous_score_is_semantic`)
  } else {
    query.append(sql`, FALSE AS previous_score_is_semantic`)
  }
  if (config.tracksOutboundActivityPubLike) {
    query.append(
      sql`, outbound_activitypub_like_activity_id AS previous_outbound_ap_like_activity_id`,
    )
  } else {
    query.append(sql`, NULL::uuid AS previous_outbound_ap_like_activity_id`)
  }
  query.append(sql`
      FROM `)
  query.append(config.voteTable)
  query.append(sql`
      WHERE user_id = ${userId} AND `)
  query.append(config.entityIdColumn)
  query.append(sql` = ANY(${values.map(v => v.entityId)}::uuid[])
      ORDER BY `)
  query.append(config.entityIdColumn)
  query.append(sql`, id DESC
    ), inserted AS (
      INSERT INTO `)
  query.append(config.voteTable)
  query.append(sql` (user_id, `)
  query.append(config.entityIdColumn)
  query.append(sql`, id, score, ip_address, device_id, session_id, user_agent_string_id`)
  if (config.tracksNeutralScore) query.append(sql`, score_is_neutral`)
  if (config.tracksSemanticScore) query.append(sql`, score_is_semantic`)
  if (config.tracksOutboundActivityPubLike) {
    query.append(sql`, outbound_activitypub_like_activity_id`)
  }
  query.append(sql`)
      SELECT input_data.user_id, input_data.entity_id, input_data.id, input_data.score,
             input_data.ip_address, input_data.device_id, input_data.session_id,
             input_data.user_agent_string_id`)
  if (config.tracksNeutralScore) query.append(sql`, input_data.score_is_neutral`)
  if (config.tracksSemanticScore) query.append(sql`, input_data.score_is_semantic`)
  if (config.tracksOutboundActivityPubLike) {
    query.append(sql`,
             CASE
               WHEN input_data.score <= 0 OR input_data.score IS NULL THEN NULL
               WHEN previous_votes.previous_score > 0
                 THEN previous_votes.previous_outbound_ap_like_activity_id
               ELSE input_data.id
             END`)
  }
  query.append(sql`
      FROM input_data
      LEFT JOIN previous_votes ON previous_votes.entity_id = input_data.entity_id
      WHERE input_data.score IS DISTINCT FROM previous_votes.previous_score
         OR input_data.score_is_neutral IS DISTINCT FROM COALESCE(previous_votes.previous_score_is_neutral, FALSE)
         OR input_data.score_is_semantic IS DISTINCT FROM COALESCE(previous_votes.previous_score_is_semantic, FALSE)
      RETURNING `)
  query.append(config.entityIdColumn)
  query.append(sql` AS entity_id, id, user_id, score, created_at`)
  if (config.tracksOutboundActivityPubLike) {
    query.append(sql`, outbound_activitypub_like_activity_id`)
  } else {
    query.append(sql`, NULL::uuid AS outbound_activitypub_like_activity_id`)
  }
  query.append(sql`
    )
    SELECT inserted.entity_id, inserted.id, inserted.user_id, inserted.score, inserted.created_at,
           inserted.outbound_activitypub_like_activity_id, previous_votes.previous_score,
           previous_votes.previous_outbound_ap_like_activity_id
    FROM inserted
    LEFT JOIN previous_votes ON previous_votes.entity_id = inserted.entity_id
  `)

  const { rows } = await run(query)
  return rows as ElectionVoteMutationResult[]
}
