import { randomUUID } from 'node:crypto'
import {
  beginTransaction,
  write,
  type QueryOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import {
  advanceFederationReplayFloorForTest,
  readFederationReplayFloorForTest,
} from './federation-retention-replay.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

/** Reproduce the old statement snapshot while keeping the singleton floor uncommitted. */
export async function runInboxReplayFloorRaceForTest(
  record: (
    activityId: string,
    type: string,
    actor: string,
    options?: QueryOptions & { signedAt?: Date },
  ) => Promise<boolean>,
): Promise<{
  error: unknown
  remainingReceipts: number
}> {
  const activityId = `https://remote.example/replay-floor/${randomUUID()}`
  const actor = 'https://remote.example/users/actor'
  await record(activityId, 'Announce', actor)
  await using holder = await beginTransaction()
  await holder(
    '/* deleteOwnedInboxRaceReceipt */ DELETE FROM activitypub_inbox_activities WHERE activity_id = $1',
    [activityId],
  )
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  try {
    return await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'recordInboxActivity',
        releaseHolder: () => holder[Symbol.asyncDispose](),
      },
      async waitForLock => {
        await using query = await beginTransaction()
        const existingFloor = await readFederationReplayFloorForTest(query)
        const signedAt = existingFloor ?? new Date()
        if (!existingFloor) await advanceFederationReplayFloorForTest(query, signedAt)
        // Substitute only the initial floor snapshot; the receipt insertion, unique wait and
        // subsequent floor read all execute against PostgreSQL. A missing floor is established only within this rolled-back transaction.
        const staleSnapshot = new Proxy(query, {
          apply(target, thisArgument, args: Parameters<TransactionQuery>) {
            const [input] = args
            if (typeof input === 'string' || !input.text.includes('/* recordInboxActivity */'))
              return Reflect.apply(target, thisArgument, args)
            const values = [...input.values, new Date(signedAt.getTime() - 1)]
            const text = input.text.replace(
              'SELECT rejection_floor_at FROM activitypub_replay_rejection_floors LIMIT 1',
              `SELECT $${values.length}::timestamptz AS rejection_floor_at`,
            )
            if (text === input.text) throw new Error('Replay floor snapshot was not replaced')
            return Reflect.apply(target, thisArgument, [text, values])
          },
        })
        const pending = record(activityId, 'Announce', actor, {
          query: staleSnapshot,
          signedAt,
        })
        const outcome = pending.then(
          () => null,
          (err: unknown) => err,
        )
        await waitForLock(pending)
        await holder.commit()
        const error = await outcome
        await query.rollback()
        const result = await write<{ count: number }>(
          '/* countOwnedInboxRaceReceipt */ SELECT count(*)::int AS count FROM activitypub_inbox_activities WHERE activity_id = $1',
          [activityId],
        )
        return { error, remainingReceipts: result.rows[0]!.count }
      },
    )
  } finally {
    await write(
      '/* cleanupOwnedInboxRaceReceipt */ DELETE FROM activitypub_inbox_activities WHERE activity_id = $1',
      [activityId],
    )
  }
}
