import { onTestFinished } from 'vitest'
import { beginTransaction } from '@data-stores/psql'
import { lockAuthorPublicationLifecycle } from '../services/post-publication/lock.mts'
import { withTestCopyrightAuthorLock } from './copyright-author-lock-owner.mts'

export async function exerciseTestCopyrightOwnedLockNotice() {
  const accountId = crypto.randomUUID()
  return withTestCopyrightAuthorLock(accountId, 1, async owner => {
    const action = owner.start(0, async connection => {
      const before = await connection.client.query<{ pid: number }>(
        '/* copyrightOwnNotice.before */ SELECT pg_backend_pid()::integer AS pid',
      )
      await using transaction = await beginTransaction(connection)
      await lockAuthorPublicationLifecycle(transaction, accountId)
      const after = await transaction<{ pid: number }>(
        '/* copyrightOwnNotice.after */ SELECT pg_backend_pid()::integer AS pid',
      )
      await transaction.commit()
      return { beforePid: before.rows[0]?.pid, afterPid: after.rows[0]?.pid }
    })
    await action.wait()
    await owner.release()
    const [outcome] = await action.settled
    if (outcome?.status !== 'fulfilled') {
      const failure = Promise.withResolvers<never>()
      failure.reject(outcome?.reason)
      return failure.promise
    }
    return outcome.value
  })
}

/** Real SQL times out when its own session intentionally suppresses the only accepted notice. */
export async function exerciseTestCopyrightSuppressedLockNotice(): Promise<void> {
  const accountId = crypto.randomUUID()
  await withTestCopyrightAuthorLock(accountId, 1, async owner => {
    const action = owner.start(0, async connection => {
      await connection.client.query(
        "/* copyrightSuppressedNotice */ SELECT set_config('log_lock_waits', 'off', false)",
      )
      await using transaction = await beginTransaction(connection)
      await lockAuthorPublicationLifecycle(transaction, accountId)
      await transaction.commit()
    })
    await action.wait()
    await owner.release()
  })
}

/** A genuine notice for another held author key must not stand in for the action's owned lock. */
export async function exerciseTestCopyrightForeignLockNotice(): Promise<void> {
  await using foreign = await beginTransaction()
  let releasing: Promise<void> | undefined
  const release = () => (releasing ??= foreign.rollback())
  onTestFinished(release)
  const foreignId = crypto.randomUUID()
  await lockAuthorPublicationLifecycle(foreign, foreignId)
  try {
    await withTestCopyrightAuthorLock(crypto.randomUUID(), 1, async owner => {
      const action = owner.start(0, async connection => {
        await using transaction = await beginTransaction(connection)
        await lockAuthorPublicationLifecycle(transaction, foreignId)
        await transaction.commit()
      })
      await action.wait()
      await owner.release()
    })
  } finally {
    await release()
  }
}
