import { beginTransaction } from '@data-stores/psql'
import { upsertPostElectionVotes } from '../services/elections-votes/post/votes-upsert.mts'
import type { ElectionVoteScore } from '../services/elections-votes/shared/types.mts'
import { beforePostgresTransactionQueryForTest } from './injected-postgres-transactions.mts'

/**
 * Writes `score` while a second request holds `siblingScore` for the same post, uncommitted, so both
 * statements read the same previous ballot exactly as two simultaneous requests do. The sibling
 * commits after the first write returns.
 */
export async function writePostVotesConcurrently(
  voterId: string,
  postId: string,
  score: ElectionVoteScore,
  siblingScore: ElectionVoteScore,
) {
  await using sibling = await beginTransaction()
  let siblingRows: Awaited<ReturnType<typeof upsertPostElectionVotes>> = []
  const restore = beforePostgresTransactionQueryForTest(
    'upsertElectionVotesShared',
    values => values.some(value => Array.isArray(value) && value.includes(postId)),
    async () => {
      siblingRows = await upsertPostElectionVotes(
        voterId,
        [{ entityId: postId, score: siblingScore }],
        undefined,
        { query: sibling },
      )
    },
  )
  try {
    const rows = await upsertPostElectionVotes(voterId, [{ entityId: postId, score }])
    await sibling.commit()
    return { rows, siblingRows }
  } finally {
    restore()
  }
}
