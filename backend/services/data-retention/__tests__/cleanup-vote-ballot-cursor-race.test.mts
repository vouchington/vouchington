import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { reserveTestVoteRetention } from '@voucha/test-helpers/vote-retention-reservation'
import {
  beginTransaction,
  getTestVoteBallotCleanupCursor,
  getTestPostVoteIds,
  insertTestPostVote,
  resetTestVoteBallotCleanupCursor,
} from '@voucha/test-helpers'
import { createTestVoteRetentionPost } from '@voucha/test-helpers/vote-retention-post'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { createExactRetentionWindow } from '@voucha/test-helpers/retention-window'
import {
  deleteTestVoteBallotCleanupCursor,
  lockTestVoteBallotCleanupCursor,
  setTestVoteBallotSweepCutoff,
} from '@voucha/test-helpers/vote-ballot-retention-cursor'
import { cleanupSupersededVoteBallots } from '../cleanup-vote-ballots.mts'

describe('vote ballot cursor retention', () => {
  it('resumes after a concurrent sweep checkpoint and advances the next ballot history', async () => {
    const reservation = await reserveTestVoteRetention()
    onTestFinished(() => reservation.release())
    const table = 'post_votes'
    const first = await createTestVoteRetentionPost()
    const next = await createTestVoteRetentionPost()
    const { aged, now } = createExactRetentionWindow(90)
    const ballotId = (offset: number) => uuidv7({ msecs: aged.getTime() + offset })
    const beforeBoth = ballotId(-5)
    const firstOlder = ballotId(-4)
    const firstLatest = ballotId(-3)
    const nextOlder = ballotId(-2)
    const nextLatest = ballotId(-1)

    await insertTestPostVote(first.postId, first.userId, '127.0.0.1', 1, firstOlder)
    await insertTestPostVote(first.postId, first.userId, '127.0.0.1', -1, firstLatest)
    await insertTestPostVote(next.postId, next.userId, '127.0.0.1', 1, nextOlder)
    await insertTestPostVote(next.postId, next.userId, '127.0.0.1', -1, nextLatest)

    await using setup = await beginTransaction()
    const previous = await getTestVoteBallotCleanupCursor(setup, table)
    await resetTestVoteBallotCleanupCursor(setup, table, beforeBoth)
    await setTestVoteBallotSweepCutoff(setup, table, ballotId(0))
    await setup.commit()

    try {
      await using sweeper = await beginTransaction()
      await lockTestVoteBallotCleanupCursor(sweeper, table)
      const holderProcessId = await getTestPostgresBackendProcessId(sweeper)
      await withTestOwnedPostgresWait(
        {
          holderProcessId,
          pool: 'write',
          lock: { kind: 'transaction' },
          queryMarker: 'vote_ballot_cleanup_cursors',
          releaseHolder: () => sweeper[Symbol.asyncDispose](),
        },
        async waitForCheckpoint => {
          const secondPage = (async () => {
            await using query = await beginTransaction()
            const [page] = await cleanupSupersededVoteBallots(4, now, undefined, [table], {
              query,
              voteIds: [],
            })
            return {
              page,
              ballots: await getTestPostVoteIds(next.postId, next.userId, query),
              progress: await getTestVoteBallotCleanupCursor(query, table),
            }
          })()
          await waitForCheckpoint(secondPage)
          const [firstPage] = await cleanupSupersededVoteBallots(4, now, undefined, [table], {
            query: sweeper,
            voteIds: [],
          })
          expect(firstPage).toMatchObject({ scanned: 3, deleted: 1, hasMore: true })
          await sweeper.commit()
          expect(await secondPage).toEqual({
            page: { voteTable: table, scanned: 3, deleted: 1, hasMore: false },
            ballots: [nextLatest],
            progress: { cursor_vote_id: nextLatest, sweep_cutoff_id: null },
          })
        },
      )
    } finally {
      await using restore = await beginTransaction()
      if (previous) {
        await resetTestVoteBallotCleanupCursor(restore, table, previous.cursor_vote_id)
        if (previous.sweep_cutoff_id)
          await setTestVoteBallotSweepCutoff(restore, table, previous.sweep_cutoff_id)
      } else await deleteTestVoteBallotCleanupCursor(restore, table)
      await restore.commit()
    }
  })
})
