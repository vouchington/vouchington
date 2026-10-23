import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type {
  ElectionVoteMutationResult,
  ElectionVoteScore,
  EntityElectionConfig,
} from './types.mts'
import { assertPlatformAccountVotesAllowed } from './platform-account-votes.mts'
import { lockTopicRssFeedAttachmentLifecycles } from '@services/post-publication/lock'
import { insertElectionVoteRows } from './vote-upsert-rows.mts'

/** Append-only simple-entity vote events; current votes are latest per user and entity. */
export async function upsertElectionVotesShared(
  config: EntityElectionConfig,
  userId: string,
  votes: Array<{
    entityId: string
    score: ElectionVoteScore
  }>,
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
    if (config.voteTable === 'topic_votes')
      await lockTopicRssFeedAttachmentLifecycles(
        query,
        values.map(value => value.entityId),
      )
    // ast-grep-ignore: no-three-sequential-awaits -- the active-user lock precedes authorization, then entity locks precede the ballot write in one transaction.
    await query(sql`/* lockActiveUserForElectionVoteMutation */
      SELECT fn_lock_active_user_for_mutation(${userId}::uuid)
    `)
    await assertPlatformAccountVotesAllowed(config, query, userId, values)
    await query(sql`/* lockElectionVoteMutations */
      SELECT pg_advisory_xact_lock(
        hashtextextended(${config.voteTable} || ':' || ${userId} || ':' || ordered.entity_id::text, 0)
      )
      FROM (
        SELECT unnest(${values.map(value => value.entityId)}::uuid[]) AS entity_id
        ORDER BY entity_id
      ) ordered
    `)
    return insertElectionVoteRows(config, userId, values, query)
  }
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
