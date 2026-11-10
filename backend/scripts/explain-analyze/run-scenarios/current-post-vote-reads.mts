import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { listPendingOutboundDistributionPage } from '@services/activitypub-delivery/distribution-recovery'
import { POST_ELECTION_CONFIG } from '@services/elections-votes/post/config'
import { aggregateElectionVoteStatsFromPrimary } from '@services/elections-votes/shared/vote-aggregation'
import { reconcilePostVoteDrift } from '@services/elections-votes/shared/vote-drift'
import { fetchElectionVoteRowsByEntityId } from '@services/elections-votes/shared/vote-queries'
import { upsertElectionVotesShared } from '@services/elections-votes/shared/vote-upsert'
import { enqueueElectionUpdatePageForUser } from '@services/vote-weight/enqueue-election-updates'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedPostId } from '../run-support.mts'

export async function runCurrentPostVoteReadScenarios(): Promise<void> {
  const userId = seedUuid(19_994, '01')
  const previous = await write<{ present: boolean }>(
    `/* checkCurrentPostVoteReadFixture */ SELECT
       EXISTS (SELECT 1 FROM post_votes WHERE post_id = $1 AND user_id = $2)
       OR EXISTS (SELECT 1 FROM post_vote_states WHERE post_id = $1 AND user_id = $2) AS present`,
    [seedPostId, userId],
  )
  assert.equal(previous.rows[0]?.present, false, 'The reserved post ballot must be empty')
  try {
    const [vote] = await upsertElectionVotesShared(POST_ELECTION_CONFIG, userId, [
      { entityId: seedPostId, score: 1 },
    ])
    assert.ok(vote)
    assert.equal(vote.outbound_activitypub_like_activity_id, vote.id)

    registerScenarioContract('current-post-votes-by-entity', {
      expectations: [{ kind: 'maxProcessedRows', relation: 'post_vote_states', max: 8 }],
    })
    await runAndCapture(
      'current-post-votes-by-entity',
      async () => {
        const rows = await fetchElectionVoteRowsByEntityId(POST_ELECTION_CONFIG, seedPostId, {
          limit: 10,
        })
        assert.ok(rows.some(row => row.user_id === userId && row.score === 1))
      },
      undefined,
      'fetchElectionVoteRowsByEntityId',
    )

    registerScenarioContract('current-post-vote-aggregate', {
      expectations: [
        { kind: 'maxProcessedRows', relation: 'post_vote_states', max: 8 },
        { kind: 'maxProcessedRows', relation: 'users', max: 8 },
      ],
    })
    await runAndCapture(
      'current-post-vote-aggregate',
      async () => {
        const result = await aggregateElectionVoteStatsFromPrimary(POST_ELECTION_CONFIG, seedPostId)
        assert.ok(result.votes_count_up >= 1)
      },
      undefined,
      'aggregateElectionVoteStats',
    )

    registerScenarioContract('current-post-vote-drift', {
      expectations: [
        { kind: 'maxProcessedRows', relation: 'post_vote_states', max: 8 },
        { kind: 'maxProcessedRows', relation: 'posts', max: 4 },
        { kind: 'maxProcessedRows', relation: 'users', max: 8 },
      ],
    })
    await runAndCapture(
      'current-post-vote-drift',
      async () => {
        const result = await reconcilePostVoteDrift(1, { samplePostIds: [seedPostId] })
        assert.equal(result.sampled, 1)
      },
      undefined,
      'reconcilePostVoteDrift',
    )

    registerScenarioContract('current-post-vote-user-fanout', {
      expectations: [{ kind: 'maxProcessedRows', relation: 'post_vote_states', max: 8 }],
    })
    await runAndCapture(
      'current-post-vote-user-fanout',
      async () => {
        const result = await enqueueElectionUpdatePageForUser(
          userId,
          { lane: 1, afterId: seedUuid(19_995, '05') },
          1,
        )
        // Existing deterministic queue jobs may deduplicate the same captured page.
        assert.ok(result.jobIds.length <= 1)
        assert.equal(result.nextCursor?.lane, 1)
      },
      undefined,
      'enqueueElectionUpdatesForUser',
    )

    registerScenarioContract('current-post-vote-outbound-recovery', {
      expectations: [
        { kind: 'maxProcessedRows', relation: 'post_votes', max: 8 },
        { kind: 'maxProcessedRows', relation: 'post_vote_states', max: 8 },
      ],
    })
    await runAndCapture(
      'current-post-vote-outbound-recovery',
      async () => {
        const page = await listPendingOutboundDistributionPage(
          'votes',
          `${seedPostId}__00000000-0000-0000-0000-000000000000`,
          2,
          seedPostId,
        )
        assert.equal(page.throughPostId, seedPostId)
        assert.ok(
          page.rows.some(
            row =>
              row.source === 'votes' &&
              row.activityId === vote.id &&
              row.targetPostId === seedPostId,
          ),
        )
      },
      undefined,
      'listPendingOutboundDistributionPage:votes',
      {
        afterCapture: async () => {
          await write(
            '/* restoreCurrentPostVoteRecoveryFixture */ UPDATE post_votes SET outbound_activitypub_distributed_at = NULL WHERE post_id = $1 AND user_id = $2 AND id = $3',
            [seedPostId, userId, vote.id],
          )
        },
      },
    )
  } finally {
    await write(
      '/* cleanupCurrentPostVoteReadState */ DELETE FROM post_vote_states WHERE post_id = $1 AND user_id = $2',
      [seedPostId, userId],
    )
    await write(
      '/* cleanupCurrentPostVoteReadEvent */ DELETE FROM post_votes WHERE post_id = $1 AND user_id = $2',
      [seedPostId, userId],
    )
  }
}
