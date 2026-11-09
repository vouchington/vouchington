import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { upsertElectionVotesShared } from '@services/elections-votes/shared/vote-upsert'
import { POST_ELECTION_CONFIG } from '@services/elections-votes/post/config'
import type { ElectionVoteScore } from '@services/elections-votes/shared/types'
import { seedUuid } from '../seed-data/common.mts'
import { POST_VOTE_STATE_TRANSITION_SCENARIO_IDS } from '../post-vote-state-scenario-ids.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedPostId } from '../run-support.mts'

/** Each paired replay sees its committed prior ballot; only the measured transition rolls back. */
export async function runPostVoteStateTransitionScenarios(): Promise<void> {
  const userId = seedUuid(19_994, '01')
  const previous = await write<{ present: boolean }>(
    `/* checkPostVoteStateFixture */ SELECT
       EXISTS (SELECT 1 FROM post_votes WHERE post_id = $1 AND user_id = $2)
       OR EXISTS (SELECT 1 FROM post_vote_states WHERE post_id = $1 AND user_id = $2) AS present`,
    [seedPostId, userId],
  )
  assert.equal(previous.rows[0]?.present, false, 'The reserved post ballot must be empty')
  const scores: ElectionVoteScore[] = [1, 2, null, 1, 1]
  try {
    for (const [index, id] of POST_VOTE_STATE_TRANSITION_SCENARIO_IDS.entries()) {
      const score = scores[index]
      assert(score !== undefined)
      const noop = id === 'post-vote-state-noop'
      registerScenarioContract(id, {
        allowEmptyResult: noop,
        expectations: [
          { kind: 'maxProcessedRows', relation: 'users', max: 4 },
          { kind: 'maxProcessedRows', relation: 'post_vote_states', max: 4 },
          { kind: 'maxProcessedRows', relation: 'post_votes', max: 4 },
        ],
      })
      // no-mistakes-disable-next-line query-reached-per-item: five ordered transition cases measure distinct INSERT/UPDATE/no-op branches, not a row-driven workload.
      await runAndCapture(
        id,
        async () => {
          await using query = await beginTransaction()
          const result = await upsertElectionVotesShared(
            POST_ELECTION_CONFIG,
            userId,
            [{ entityId: seedPostId, score }],
            undefined,
            { query },
          )
          assert.equal(result.length, noop ? 0 : 1)
          await query.rollback()
        },
        undefined,
        ['assertActiveElectionVoter', 'upsertElectionVotesShared'],
      )
      // Setup is outside capture: the next replay must exercise UPDATE/clear/no-op, not an empty INSERT.
      // no-mistakes-disable-next-line query-reached-per-item: advance the single owned ballot between five fixed transition scenarios.
      await upsertElectionVotesShared(POST_ELECTION_CONFIG, userId, [
        { entityId: seedPostId, score },
      ])
    }
  } finally {
    await write(
      '/* cleanupPostVoteStateFixture */ DELETE FROM post_vote_states WHERE post_id = $1 AND user_id = $2',
      [seedPostId, userId],
    )
    await write(
      '/* cleanupPostVoteEventFixture */ DELETE FROM post_votes WHERE post_id = $1 AND user_id = $2',
      [seedPostId, userId],
    )
  }
}
