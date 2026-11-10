import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { loadPostWriteThread } from '@services/posts/write-thread'
import { lockDelegatedPostThread } from '@services/posts/delegated-write-locks'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { commentSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from '../seed-data/common.mts'
import { COMMENT_DESCENDANT_DEPTH_LEAF_ID } from '../seed-data/comment-descendant-depth.mts'

/** The same fixed-size write context for a direct reply and a 436-level comment. */
export async function runDelegatedWriteContextScenarios(): Promise<void> {
  for (const [suffix, postId, count] of [
    ['direct', seedUuidAtTimestamp(commentSeedTimestampMs(0, 1), 0), 1],
    ['deep', COMMENT_DESCENDANT_DEPTH_LEAF_ID, 2],
  ] as const) {
    const id = `delegated-write-context-${suffix}`
    registerScenarioContract(id, {
      expectations: [{ kind: 'maxProcessedRows', relation: 'posts', max: 2 }],
      forbidSequentialScans: ['posts'],
      crossPartition: { posts: 'Parent and stored root are two explicit UUIDv7 keys.' },
    })
    // no-mistakes-disable-next-line query-reached-per-item: two fixed depth witnesses independently verify the same at-most-two-row authorization context query.
    await runAndCapture(
      id,
      async () => {
        const result = await loadPostWriteThread(postId, { readOnly: false })
        assert.equal(result.nodes.length, count + 1)
      },
      undefined,
      'loadPostWriteThread.context',
    )
  }
  for (const [suffix, postId] of [
    ['target', COMMENT_DESCENDANT_DEPTH_LEAF_ID],
    ['missing', seedUuid(9_525_000, '05')],
  ] as const) {
    const id = `delegated-write-lock-${suffix}`
    registerScenarioContract(id, {
      expectations: [{ kind: 'maxProcessedRows', relation: 'posts', max: 1 }],
      forbidSequentialScans: ['posts'],
      allowEmptyResult: suffix === 'missing',
    })
    // no-mistakes-disable-next-line query-reached-per-item: fixed hit/miss probes independently capture the one written-row lock, always rolled back after capture.
    await runAndCapture(
      id,
      async () => {
        await using query = await beginTransaction()
        if (suffix === 'missing')
          await assert.rejects(lockDelegatedPostThread(query, postId), { status: 404 })
        else await lockDelegatedPostThread(query, postId)
      },
      undefined,
      'lockDelegatedPostThread.rows',
    )
  }
}
