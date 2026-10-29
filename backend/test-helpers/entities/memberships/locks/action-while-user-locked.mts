import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { withTestOwnedPostgresWait } from '../../../postgres-client-lock-observer.mts'
import sql from 'sql-template-strings'

type MembershipUserLockTestOptions<T> = {
  userId: string
  lockingQueryComment: string
  startAction: () => Promise<T>
  whileActionBlocked: (query: QueryExecutor) => Promise<void>
}

export async function runTestActionWhileMembershipUserLocked<T>(
  options: MembershipUserLockTestOptions<T>,
): Promise<T> {
  await using holder = await beginTransaction()
  let releasing: Promise<void> | undefined
  const releaseHolder = () => (releasing ??= Promise.resolve(holder[Symbol.asyncDispose]()))

  try {
    const { rows } = await holder<{ process_id: number }>(sql`
      /* runTestActionWhileMembershipUserLocked:holder */
      SELECT pg_backend_pid()::integer AS process_id
      FROM users WHERE id = ${options.userId} FOR UPDATE`)
    const holderProcessId = rows[0]?.process_id
    if (holderProcessId === undefined)
      throw new Error('Membership user lock transaction completed before acquiring the lock')

    return await withTestOwnedPostgresWait(
      {
        pool: 'write',
        holderProcessId,
        lock: { kind: 'transaction' },
        queryMarker: options.lockingQueryComment,
        releaseHolder,
      },
      async waitForLock => {
        const action = Promise.resolve().then(options.startAction)
        const outcome = action.then(
          value => ({ status: 'fulfilled' as const, value }),
          err => ({ status: 'rejected' as const, reason: err }),
        )
        let waitFailure: { reason: unknown } | undefined
        try {
          await waitForLock(action)
        } catch (err) {
          waitFailure = { reason: err }
        }
        // Preserve the callback on early settlement, but roll back if it or commit fails.
        try {
          await options.whileActionBlocked(holder)
          await holder.commit()
        } finally {
          await releaseHolder()
        }
        const result = await outcome
        if (result.status === 'rejected') throw result.reason
        if (waitFailure) {
          const err = waitFailure.reason
          if (
            err instanceof Error &&
            err.message === 'Owned action settled without its native lock wait'
          )
            throw new Error('Membership action completed before waiting for the user lock', {
              cause: err,
            })
          throw err
        }
        return result.value
      },
    )
  } finally {
    await releaseHolder()
  }
}
