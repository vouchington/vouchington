import { beginTransaction } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type {
  ElectionVoteMutationResult,
  ElectionVoteScore,
  VoteEventContext,
} from '../../../services/elections-votes/shared/types.mts'

type VotesUpsert = (
  userId: string,
  votes: Array<{ entityId: string; score: ElectionVoteScore }>,
  context?: VoteEventContext,
  queryOptions?: QueryOptions,
) => Promise<ElectionVoteMutationResult[]>

export async function commitTestElectionVoteTransaction(
  upsertVotes: VotesUpsert,
  userId: string,
  entityId: string,
  beforeCommit: () => void,
): Promise<void> {
  await using transaction = await beginTransaction()
  await upsertVotes(userId, [{ entityId, score: 1 }], undefined, { query: transaction })
  beforeCommit()
  await transaction.commit()
}

export async function rollbackTestElectionVoteTransaction(
  upsertVotes: VotesUpsert,
  userId: string,
  entityId: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await upsertVotes(userId, [{ entityId, score: 1 }], undefined, { query: transaction })
  await transaction.rollback()
}
