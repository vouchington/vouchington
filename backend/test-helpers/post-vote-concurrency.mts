import { v7 } from 'uuid'
import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
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

export function createTestPostVoteCaseVariantId(): string {
  return `${v7().slice(0, -1)}a`
}
