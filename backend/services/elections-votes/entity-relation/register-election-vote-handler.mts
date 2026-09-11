import type { BasicUser } from '@services/users/types'
import type { EntityRelationMetadata } from '@services/entity-relations/metadata'
import type {
  EntityRelation,
  UpsertEntityRelationsOptions,
} from '@services/entity-relations/upsert-helpers'
import { registerElectionVoteHandler } from '@services/entity-relations/election-vote-handler-registry'
import { registerPostCommitAction } from '@data-stores/psql'
import { upsertEntityRelationElectionVotes } from './votes-upsert.mts'
import {
  publishEntityRelationElectionVoteStats,
  updateEntityRelationElectionVoteStatsFromPrimaryBatch,
} from './vote-stats-batch.mts'
import { createEntityRelationElectionTarget } from './target.mts'
import type { ElectionVoteScore } from './types.mts'
import type { QueryExecutor, TransactionQuery } from '@data-stores/psql/types'

function isTransactionQuery(query: QueryExecutor): query is TransactionQuery {
  return (query as Partial<TransactionQuery>).client !== undefined
}

async function handleEntityRelationElectionVotes(
  creator: BasicUser,
  relation: EntityRelationMetadata,
  relations: EntityRelation[],
  options?: UpsertEntityRelationsOptions,
): Promise<void> {
  const transactionQuery =
    options?.query && isTransactionQuery(options.query) ? options.query : undefined
  const votes = relations.flatMap(r =>
    r.id ? [{ entityId: r.id, score: 1 as ElectionVoteScore }] : [],
  )

  if (votes.length > 0) {
    await upsertEntityRelationElectionVotes(creator.id, votes, undefined, relation, {
      query: options?.query,
      // A queue worker cannot observe an uncommitted outer transaction. Refresh the primary
      // aggregate on that same transaction instead; callers without a transaction retain the
      // existing asynchronous queue path below.
      enqueueVoteStats: transactionQuery ? false : options?.enqueueVoteStats,
    })
    if (transactionQuery) {
      const changedTargets = await updateEntityRelationElectionVoteStatsFromPrimaryBatch(
        votes.map(vote => createEntityRelationElectionTarget(vote.entityId, relation.table_name)),
        {
          query: transactionQuery,
          invalidateCache: false,
          enqueueTopHashtagRefresh: false,
        },
      )
      if (changedTargets.length > 0) {
        registerPostCommitAction(transactionQuery, () =>
          publishEntityRelationElectionVoteStats(changedTargets, {
            enqueueTopHashtagRefresh: false,
          }),
        )
      }
    }
  }
}

registerElectionVoteHandler(handleEntityRelationElectionVotes)
