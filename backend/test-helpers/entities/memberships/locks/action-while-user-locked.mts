import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import { setTimeout as delay } from 'node:timers/promises'
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
  const userLocked = Promise.withResolvers<void>()
  const actionBlocked = Promise.withResolvers<void>()
  const lockTransaction = holdMembershipUserLock(options, userLocked, actionBlocked)
  await Promise.race([
    userLocked.promise,
    lockTransaction.then(() => {
      throw new Error('Membership user lock transaction completed before acquiring the lock')
    }),
  ])
  const action = Promise.resolve().then(options.startAction)
  try {
    await waitForTestActionToBlockOnMembershipUserLock(action, options.lockingQueryComment)
  } finally {
    actionBlocked.resolve()
    await lockTransaction
  }
  return action
}

async function holdMembershipUserLock<T>(
  options: MembershipUserLockTestOptions<T>,
  userLocked: PromiseWithResolvers<void>,
  actionBlocked: PromiseWithResolvers<void>,
): Promise<void> {
  await using transaction = await beginTransaction()
  const query = transaction
  await query(sql`/* runTestActionWhileMembershipUserLocked */
    SELECT id FROM users WHERE id = ${options.userId} FOR UPDATE`)
  userLocked.resolve()
  await actionBlocked.promise
  await options.whileActionBlocked(query)
  await transaction.commit()
}

async function waitForTestActionToBlockOnMembershipUserLock(
  action: Promise<unknown>,
  lockingQueryComment: string,
): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const { rows } = await write<{ blocked: boolean }>(
      sql`/* waitForTestActionToBlockOnMembershipUserLock */ SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity
        WHERE pid <> pg_backend_pid() AND state = 'active' AND wait_event_type = 'Lock'
          AND query LIKE ${`%${lockingQueryComment}%`}
      ) AS blocked`,
    )
    if (rows[0]?.blocked) return
    const stillWaiting = await Promise.race([action.then(() => false), delay(10).then(() => true)])
    if (!stillWaiting)
      throw new Error('Membership action completed before waiting for the user lock')
  }
  throw new Error('Membership action did not wait for the user lock')
}
