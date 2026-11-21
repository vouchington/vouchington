import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import type {
  ElectionVoteMutationResult,
  ElectionVoteScore,
  EntityElectionConfig,
  VoteEventContext,
} from './types.mts'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import { assertPlatformAccountVotesAllowed } from './platform-account-votes.mts'
import { insertElectionVoteRows } from './vote-upsert-rows.mts'

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
    const activeUser = await query<{ id: string }>(sql`/* assertActiveElectionVoter */
      SELECT id FROM users WHERE id = ${userId}::uuid AND deleted_at IS NULL LIMIT 1
    `)
    if (!activeUser.rows[0]) throw createHttpError(401, 'User not found')
    await assertPlatformAccountVotesAllowed(config, query, userId, values)
    // Keep every vote mutation query on this transaction's client. In particular, a user-agent
    // lookup cannot acquire a second write-pool client while an outer caller already holds one.
    if (config.tracksOutboundActivityPubLike) await lockLikeGenerations(query, userId, values)
    const userAgentId = await upsertUserAgentString(context.userAgent?.trim() || null, { query })
    return insertElectionVoteRows(config, userId, values, context, userAgentId, query)
  }
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}

/**
 * Serialize concurrent ballots on one (user, post) so only one request crosses the non-Like to Like
 * boundary. Ballots are append-only, so the previous-vote read cannot see an uncommitted sibling
 * and no constraint can reject the second root; two racing requests would each mint and federate
 * their own Like activity. The lock is transaction-scoped and ordered by entity id. Later requests
 * re-read the committed Like and inherit its activity identity. Other vote tables stay lock-free.
 */
async function lockLikeGenerations(
  query: TransactionQuery,
  userId: string,
  values: Array<{ entityId: string }>,
): Promise<void> {
  await query(sql`/* lockElectionLikeGenerations */
    SELECT pg_advisory_xact_lock(
      hashtextextended('election_like_generation:' || ${userId}::text || ':' || ordered.entity_id::text, 0)
    )
    FROM (
      SELECT unnest(${values.map(v => v.entityId)}::uuid[]) AS entity_id ORDER BY entity_id
    ) ordered
  `)
}
