import assert from 'node:assert/strict'
import { getPostElectionsByIdBatch } from '@services/elections-votes/post/get-election-batch'
import { paginationMaxima } from '@services/pagination/config'
import { runAndCapture } from '../run-support.mts'
import { communityHotPostStats } from '../seed-data/community-hot.mts'

export async function runPostElectionReadCapacityScenario(): Promise<void> {
  // A feed uses one election lookup per returned post. The community hot feed seed supplies
  // approved posts with three distinct combinations of net score and vote counts.
  const stats = communityHotPostStats()
  const pageRows = [
    ...stats.filter((_, index) => index % 2 === 0),
    ...stats.filter((_, index) => index % 2 === 1).toReversed(),
  ]
  const ids = pageRows.map(row => row.postId)
  assert.equal(new Set(ids).size, paginationMaxima.max_limit)

  await runAndCapture(
    'post-elections-batch-at-cap',
    async () => {
      const elections = await getPostElectionsByIdBatch(ids)
      assert.deepEqual(
        elections,
        pageRows.map(row => ({
          __entity_type: 'post_election',
          id: row.postId,
          votes_score_net: row.votesScoreUp - row.votesScoreDown,
          votes_count_up: row.votesCountUp,
          votes_count_down: row.votesCountDown,
        })),
      )
    },
    undefined,
    'getElectionsByIdBatch',
    { exactCapturedNames: ['getElectionsByIdBatch'] },
  )
}
