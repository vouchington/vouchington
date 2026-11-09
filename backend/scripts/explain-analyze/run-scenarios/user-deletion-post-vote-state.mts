import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { deleteOwnedRows } from '@services/users/delete-phase-transaction'
import { upsertElectionVotesShared } from '@services/elections-votes/shared/vote-upsert'
import { POST_ELECTION_CONFIG } from '@services/elections-votes/post/config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedPostId } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runUserDeletionPostVoteStateScenario(): Promise<void> {
  const userId = seedUuid(19_994, '01')
  const prior = await write<{ present: boolean }>(
    `/* checkDeletionPostVoteStateFixture */ SELECT
      EXISTS (SELECT 1 FROM post_vote_states WHERE post_id = $1 AND user_id = $2)
      OR EXISTS (SELECT 1 FROM post_votes WHERE post_id = $1 AND user_id = $2) AS present`,
    [seedPostId, userId],
  )
  assert.equal(prior.rows[0]?.present, false)
  try {
    const votes = await upsertElectionVotesShared(POST_ELECTION_CONFIG, userId, [
      { entityId: seedPostId, score: 1 },
    ])
    assert.equal(votes.length, 1)
    registerScenarioContract('user-deletion-post-vote-state', {
      allowEmptyResult: true,
      expectations: [{ kind: 'maxProcessedRows', relation: 'post_vote_states', max: 8 }],
    })
    await runAndCapture(
      'user-deletion-post-vote-state',
      async () => {
        await using query = await beginTransaction()
        const deleted = await deleteOwnedRows(
          query,
          'post_vote_states',
          new Set(['post_vote_states']),
          'user_id',
          'post_id',
          new Set(['post_id']),
          userId,
          1,
        )
        assert.equal(deleted, 1)
        await query.rollback()
      },
      undefined,
      ['processUserDeletionOwnedRows:candidates', 'processUserDeletionOwnedRows'],
    )
  } finally {
    await write(
      '/* cleanupDeletionPostVoteStateFixture */ DELETE FROM post_vote_states WHERE post_id = $1 AND user_id = $2',
      [seedPostId, userId],
    )
    await write(
      '/* cleanupDeletionPostVoteEventFixture */ DELETE FROM post_votes WHERE post_id = $1 AND user_id = $2',
      [seedPostId, userId],
    )
  }
}
