import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import { setTimeout as delay } from 'node:timers/promises'
import sql from 'sql-template-strings'

export async function runConcurrentTestMembershipProductValidation<T>(
  validate: (query: QueryExecutor) => Promise<T>,
): Promise<T> {
  const firstValidationLocked = Promise.withResolvers<void>()
  const releaseFirstValidation = Promise.withResolvers<void>()
  const firstValidation = holdFirstValidation()

  async function holdFirstValidation(): Promise<T> {
    await using transaction = await beginTransaction()
    const query = transaction
    const result = await validate(query)
    firstValidationLocked.resolve()
    await releaseFirstValidation.promise
    await transaction.commit()
    return result
  }

  await firstValidationLocked.promise
  const secondValidation = runSecondValidation()

  async function runSecondValidation(): Promise<T> {
    await using transaction = await beginTransaction()
    const result = await validate(transaction)
    await transaction.commit()
    return result
  }
  try {
    const completedWhileFirstHeld = await Promise.race([
      secondValidation.then(() => true),
      delay(5_000).then(() => false),
    ])
    if (!completedWhileFirstHeld)
      throw new Error('Concurrent membership product validation was blocked')
  } finally {
    releaseFirstValidation.resolve()
    await Promise.all([firstValidation, secondValidation])
  }
  return await secondValidation
}

export async function runConcurrentTestRetainedMembershipProductReconciliation<T>(options: {
  membershipSourceId: string
  userId: string
  validate: (query: QueryExecutor) => Promise<T>
}): Promise<[T, T]> {
  const firstValidated = Promise.withResolvers<void>()
  const secondValidated = Promise.withResolvers<void>()
  const firstUserLocked = Promise.withResolvers<void>()
  const secondUserLockRequested = Promise.withResolvers<void>()
  const allowSourceStateUpdate = Promise.withResolvers<void>()
  const secondBackendProcessId = Promise.withResolvers<number>()
  void firstUserLocked.promise.catch(() => {})
  void secondUserLockRequested.promise.catch(() => {})
  void secondBackendProcessId.promise.catch(() => {})

  const first = runFirstReconciliation()

  async function runFirstReconciliation(): Promise<T> {
    await using transaction = await beginTransaction()
    const query = transaction
    try {
      const result = await options.validate(query)
      firstValidated.resolve()
      await secondValidated.promise
      await query(sql`/* runConcurrentTestRetainedMembershipProductReconciliation:first user lock */
          SELECT id FROM users WHERE id = ${options.userId} FOR UPDATE`)
      firstUserLocked.resolve()
      await allowSourceStateUpdate.promise
      await query(sql`/* runConcurrentTestRetainedMembershipProductReconciliation:first source lock */
          SELECT id FROM membership_sources WHERE id = ${options.membershipSourceId} FOR UPDATE`)
      await query(sql`/* runConcurrentTestRetainedMembershipProductReconciliation:source state update */
          UPDATE membership_source_states
          SET updated_at = CURRENT_TIMESTAMP
          WHERE membership_source_id = ${options.membershipSourceId}`)
      await transaction.commit()
      return result
    } catch (error) {
      firstValidated.reject(error)
      firstUserLocked.reject(error)
      throw error
    }
  }

  let second: Promise<T> | undefined
  async function runSecondReconciliation(): Promise<T> {
    await using transaction = await beginTransaction()
    const query = transaction
    try {
      const { rows } = await query(
        sql`/* runConcurrentTestRetainedMembershipProductReconciliation:backend pid */
            SELECT pg_backend_pid() AS process_id`,
      )
      secondBackendProcessId.resolve((rows[0] as { process_id: number }).process_id)
      const result = await options.validate(query)
      secondValidated.resolve()
      await firstUserLocked.promise
      const userLock = query(
        sql`/* runConcurrentTestRetainedMembershipProductReconciliation:second user lock */
            SELECT id FROM users WHERE id = ${options.userId} FOR UPDATE`,
      )
      secondUserLockRequested.resolve()
      await userLock
      await transaction.commit()
      return result
    } catch (error) {
      secondBackendProcessId.reject(error)
      secondValidated.reject(error)
      secondUserLockRequested.reject(error)
      throw error
    }
  }

  try {
    await firstValidated.promise
    second = runSecondReconciliation()

    await secondValidated.promise
    await firstUserLocked.promise
    await secondUserLockRequested.promise
    await waitForTestPostgresLock(secondBackendProcessId.promise)
    allowSourceStateUpdate.resolve()
    return await Promise.all([first, second])
  } finally {
    allowSourceStateUpdate.resolve()
    await Promise.allSettled(second ? [first, second] : [first])
  }
}

async function waitForTestPostgresLock(processId: Promise<number>): Promise<void> {
  const pid = await processId
  for (let attempt = 0; attempt < 500; attempt++) {
    const { rows } = await write(sql`/* waitForTestPostgresLock */
      SELECT wait_event_type = 'Lock' AS is_waiting
      FROM pg_stat_activity
      WHERE pid = ${pid}`)
    if ((rows[0] as { is_waiting: boolean } | undefined)?.is_waiting) return
    await delay(10)
  }
  throw new Error('Concurrent membership product reconciliation did not wait on the user lock')
}

export async function withTestMembershipUserLocked<T>(
  userId: string,
  callback: () => Promise<T>,
): Promise<T> {
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(sql`/* withTestMembershipUserLocked */
        SELECT id FROM users WHERE id = ${userId} FOR UPDATE`)
    const result = await callback()
    await transaction.commit()
    return result
  }
}

export { runTestActionWhileMembershipUserLocked } from './locks/action-while-user-locked.mts'
