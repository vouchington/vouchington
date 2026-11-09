import { v7 } from 'uuid'
import { beginTransaction, write, writePool, type TransactionQuery } from '@data-stores/psql'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { observeTestTransactionLockNotice } from './postgres-advisory-lock-notice.mts'
import {
  getTestOwnedPostgresLock,
  assertTestOwnedPostgresWait,
} from './postgres-client-lock-identity.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

/** Let the second shared writer reach the first writer's real unique-ballot conflict. */
export async function runTestPostVoteWriteConflict<Result>(
  first: (query: TransactionQuery) => Promise<Result>,
  second: () => Promise<Result>,
): Promise<{ first: Result; second: Result }> {
  await using holder = await beginTransaction()
  const firstResult = await first(holder)
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  let releasing: Promise<void> | undefined
  const releaseHolder = () => (releasing ??= Promise.resolve(holder[Symbol.asyncDispose]()))
  const secondResult = await withTestOwnedPostgresWait(
    {
      pool: 'write',
      holderProcessId,
      lock: { kind: 'transaction' },
      queryMarker: 'upsertElectionVotesShared',
      releaseHolder,
    },
    async waitForLock => {
      const action = Promise.resolve().then(second)
      const outcome = Promise.allSettled([action])
      try {
        await waitForLock(action)
        await holder.commit()
      } finally {
        await releaseHolder()
      }
      const [result] = await outcome
      if (!result || result.status === 'rejected')
        throw result?.reason ?? new Error('Missing vote result')
      return result.value
    },
  )
  return { first: firstResult, second: secondResult }
}

type StoredPostVoteEvent = {
  id: string
  score: number | null
  outbound_activitypub_like_activity_id: string | null
  outbound_activitypub_original_like_activity_id: string | null
}

export async function getTestPostVoteTransitionState(userId: string, postId: string) {
  const events = await write<StoredPostVoteEvent>(
    `/* getTestPostVoteTransitionEvents */ SELECT id, score,
       outbound_activitypub_like_activity_id, outbound_activitypub_original_like_activity_id
     FROM post_votes WHERE post_id = $1 AND user_id = $2 ORDER BY id`,
    [postId, userId],
  )
  const state = await write<
    Omit<StoredPostVoteEvent, 'outbound_activitypub_original_like_activity_id'>
  >(
    `/* getTestPostVoteTransitionState */ SELECT id, score, outbound_activitypub_like_activity_id
     FROM post_vote_states WHERE post_id = $1 AND user_id = $2`,
    [postId, userId],
  )
  return { events: events.rows, state: state.rows }
}

/** Start the waiter first, then commit a later-started ballot before releasing its opposite vote. */
export async function runTestEarlierPostVoteWait<Result>(
  laterWrite: (query: TransactionQuery) => Promise<Result>,
  earlierWrite: (query: TransactionQuery) => Promise<Result>,
): Promise<{ later: Result; earlier: Result }> {
  const client = await writePool.connect()
  try {
    await using earlier = await beginTransaction({ client })
    const { rows: start } = await earlier<{ started_at: string }>(
      '/* startEarlierPostVoteTransaction */ SELECT transaction_timestamp()::text AS started_at',
    )
    await using later = await beginTransaction()
    const { rows: order } = await later<{ later: boolean }>(
      '/* verifyPostVoteTransactionStartOrder */ SELECT transaction_timestamp() > $1::timestamptz AS later',
      [start[0]!.started_at],
    )
    if (!order[0]?.later) throw new Error('Expected the ballot holder to start after its waiter')
    const laterResult = await laterWrite(later)
    const holderProcessId = await getTestPostgresBackendProcessId(later)
    const lock = await getTestOwnedPostgresLock(later.client, {
      holderProcessId,
      lock: { kind: 'transaction' },
    })
    if (lock.kind !== 'transaction') throw new Error('Expected a written ballot transaction')
    const notice = observeTestTransactionLockNotice(client, lock.transactionId)
    let outcome: Promise<PromiseSettledResult<Result>[]> | undefined
    try {
      const waiter = await notice.ready
      const action = earlierWrite(earlier)
      outcome = Promise.allSettled([action])
      await notice.wait(outcome)
      // This transaction already read pg_stat_activity for the holder's lock identity.
      await later('/* refreshPostVoteWaitWitness */ SELECT pg_stat_clear_snapshot()')
      await assertTestOwnedPostgresWait(
        later.client,
        waiter.processId,
        holderProcessId,
        'upsertElectionVotesShared',
      )
      await later.commit()
      const result = await action
      await earlier.commit()
      return { later: laterResult, earlier: result }
    } finally {
      await later[Symbol.asyncDispose]()
      await outcome
      await earlier[Symbol.asyncDispose]()
      await notice.close()
    }
  } finally {
    client.release()
  }
}

export function createTestPostVoteCaseVariantId(): string {
  return `${v7().slice(0, -1)}a`
}
