import { beginTransaction, withTransactionOptions, type QueryExecutor } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type {
  ElectionVoteMutationResult,
  ElectionVoteScore,
  EntityElectionConfig,
  VoteEventContext,
} from './types.mts'
import { upsertVoteUserAgent } from './upsert-vote-user-agent.mts'

/** Append-only simple-entity vote events; current votes are latest per user and entity. */
const NULL_VOTE_CONTEXT: VoteEventContext = {
  ipAddress: null,
  deviceId: null,
  sessionId: null,
  userAgent: null,
}

export async function upsertElectionVotesShared(
  config: EntityElectionConfig,
  userId: string,
  votes: Array<{
    entityId: string
    score: ElectionVoteScore
  }>,
  context: VoteEventContext = NULL_VOTE_CONTEXT,
  options: QueryOptions = {},
): Promise<ElectionVoteMutationResult[]> {
  if (votes.length === 0) return []

  // Deduplicate by entity ID — last occurrence wins (consistent with previous upsert behavior).
  const seen = new Map<
    string,
    {
      userId: string
      entityId: string
      score: ElectionVoteScore
      scoreIsNeutral: boolean
      scoreIsSemantic: boolean
    }
  >()
  for (const v of votes) {
    seen.set(v.entityId, {
      userId,
      entityId: v.entityId,
      score: v.score,
      scoreIsNeutral: config.tracksNeutralScore === true && v.score === 0,
      scoreIsSemantic: config.tracksSemanticScore === true && v.score !== null,
    })
  }
  const values = [...seen.values()]
  // Sort by entityId for deterministic index-lock acquisition order (prevents ABBA deadlocks).
  values.sort((a, b) => (a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0))

  const run = async (query: TransactionQuery): Promise<ElectionVoteMutationResult[]> => {
    await query(sql`/* lockActiveUserForElectionVoteMutation */
      SELECT fn_lock_active_user_for_mutation(${userId}::uuid)
    `)
    // Keep every vote mutation query on this transaction's client. In particular, a user-agent
    // lookup cannot acquire a second write-pool client while an outer caller already holds one.
    const userAgentId = await upsertVoteUserAgent(context.userAgent, { query })
    await query(sql`/* lockElectionVoteMutations */
      SELECT pg_advisory_xact_lock(
        hashtextextended(${config.voteTable} || ':' || ${userId} || ':' || ordered.entity_id::text, 0)
      )
      FROM (
        SELECT unnest(${values.map(value => value.entityId)}::uuid[]) AS entity_id
        ORDER BY entity_id
      ) ordered
    `)
    return insertElectionVoteRows(config, userId, values, context, userAgentId, query)
  }
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}

async function insertElectionVoteRows(
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
      ) AS raw(user_id, entity_id, score, ip_address, device_id, session_id, user_agent_id, score_is_neutral, score_is_semantic)
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
    query.append(sql`, outbound_ap_like_activity_id AS previous_outbound_ap_like_activity_id`)
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
  query.append(sql`, id, score, ip_address, device_id, session_id, user_agent_id`)
  if (config.tracksNeutralScore) query.append(sql`, score_is_neutral`)
  if (config.tracksSemanticScore) query.append(sql`, score_is_semantic`)
  if (config.tracksOutboundActivityPubLike) {
    query.append(sql`, outbound_ap_like_activity_id`)
  }
  query.append(sql`)
      SELECT input_data.user_id, input_data.entity_id, input_data.id, input_data.score,
             input_data.ip_address, input_data.device_id, input_data.session_id,
             input_data.user_agent_id`)
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
    query.append(sql`, outbound_ap_like_activity_id`)
  } else {
    query.append(sql`, NULL::uuid AS outbound_ap_like_activity_id`)
  }
  query.append(sql`
    )
    SELECT inserted.entity_id, inserted.id, inserted.user_id, inserted.score, inserted.created_at,
           inserted.outbound_ap_like_activity_id, previous_votes.previous_score,
           previous_votes.previous_outbound_ap_like_activity_id
    FROM inserted
    LEFT JOIN previous_votes ON previous_votes.entity_id = inserted.entity_id
  `)

  const { rows } = await run(query)
  return rows as ElectionVoteMutationResult[]
}
