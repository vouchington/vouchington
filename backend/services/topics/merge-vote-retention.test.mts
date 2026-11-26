import { createTestTopic, createTestUser, insertTopicElectionVote } from '@voucha/test-helpers'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { settleTopicMergeOperationForTest } from '@voucha/test-helpers/merge-topics'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { getTopicMergeVoteHistory } from '@voucha/test-helpers/topic-merge-metrics-parity'
import { createTopicMergeNativeOperation } from '@voucha/test-helpers/topic-merge-native-operation'
import { v7 as uuidv7 } from 'uuid'
import { describe, expect, it, onTestFinished } from 'vitest'
import { cleanupSupersededVoteBallots } from '../data-retention/cleanup-vote-ballots.mts'

describe('topic merge vote retention', () => {
  it('completes the merge with the surviving ballot when an in-flight retention delete commits', async () => {
    const admin = await createTestUser({ administrator: true })
    const [source, destination] = await Promise.all([
      createTestTopic({ user: admin }),
      createTestTopic({ user: admin }),
    ])
    const now = new Date()
    const day = 24 * 60 * 60 * 1_000
    const olderId = uuidv7({ msecs: now.getTime() - day * 130 })
    const newerId = uuidv7({ msecs: now.getTime() - day * 120 })
    await insertTopicElectionVote(admin.id, source.id, 1, olderId)
    await insertTopicElectionVote(admin.id, source.id, -1, newerId)

    const deleted = Promise.withResolvers<number>()
    const releaseRetention = Promise.withResolvers<void>()
    onTestFinished(
      afterPostgresTransactionQueryForTest(
        '/* deleteSupersededVoteBallots */',
        values => values[0] === source.id && values[1] === admin.id,
        async transaction => {
          deleted.resolve(await getTestPostgresBackendProcessId(transaction))
          await releaseRetention.promise
        },
      ),
    )

    const retention = cleanupSupersededVoteBallots(2, now, { topic_votes: [newerId] }, [
      'topic_votes',
    ])
    try {
      // Retention already deleted its ballot before the operation becomes visible.
      const holderProcessId = await Promise.race([
        deleted.promise,
        retention.then(() => {
          throw new Error('Retention completed before the deletion could overlap the merge')
        }),
      ])
      const operationId = await createTopicMergeNativeOperation(source.id, destination.id, admin.id)
      await withTestOwnedPostgresWait(
        {
          holderProcessId,
          pool: 'write',
          lock: { kind: 'transaction' },
          queryMarker: 'processTopicMergeVoteReferencePage choose',
          releaseHolder: async () => {
            releaseRetention.resolve()
            await Promise.allSettled([retention])
          },
        },
        async waitForLock => {
          const merge = settleTopicMergeOperationForTest(admin, source.id, operationId)
          await waitForLock(merge)
          releaseRetention.resolve()
          await expect(retention).resolves.toEqual([
            { voteTable: 'topic_votes', scanned: 2, deleted: 1, hasMore: false },
          ])
          await expect(merge).resolves.toMatchObject({ status: 'completed', error_code: null })
        },
      )
    } finally {
      releaseRetention.resolve()
      await Promise.allSettled([retention])
    }

    await expect(getTopicMergeVoteHistory(admin.id, [source.id, destination.id])).resolves.toEqual([
      { topic_id: destination.id, score: -1 },
    ])
  })
})
