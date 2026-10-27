import { beginTransaction, writePool, type PoolClient, type QueryExecutor } from '@data-stores/psql'
import { onTestFinished } from 'vitest'
import { observeTestTransactionLockNotice } from '../../postgres-advisory-lock-notice.mts'
import sql from 'sql-template-strings'

export { runConcurrentTestMembershipProductValidation } from '../../membership-product-validation.mts'

export async function runConcurrentTestRetainedMembershipProductReconciliation<T>(options: {
  membershipSourceId: string
  userId: string
  validate: (query: QueryExecutor) => Promise<T>
}): Promise<[T, T]> {
  const firstValidated = Promise.withResolvers<void>()
  const secondValidated = Promise.withResolvers<void>()
  const firstUserLocked = Promise.withResolvers<string>()
  const secondUserLockRequested = Promise.withResolvers<void>()
  const allowSourceStateUpdate = Promise.withResolvers<void>()
  const lockObservation =
    Promise.withResolvers<ReturnType<typeof observeTestTransactionLockNotice>>()
  void firstUserLocked.promise.catch(() => {})
  void secondUserLockRequested.promise.catch(() => {})
  void lockObservation.promise.catch(() => {})

  const first = runFirstReconciliation()

  async function runFirstReconciliation(): Promise<T> {
    try {
      await using transaction = await beginTransaction()
      const query = transaction
      const result = await options.validate(query)
      firstValidated.resolve()
      await secondValidated.promise
      await query(sql`/* runConcurrentTestRetainedMembershipProductReconciliation:first user lock */
          SELECT id FROM users WHERE id = ${options.userId} FOR UPDATE`)
      const { rows } = await query<{ transaction_id: string }>(
        sql`/* runConcurrentTestRetainedMembershipProductReconciliation:first transaction identity */
          SELECT pg_current_xact_id()::text AS transaction_id`,
      )
      const transactionId = rows[0]?.transaction_id
      if (!transactionId) throw new Error('Membership user-lock holder has no transaction identity')
      firstUserLocked.resolve(transactionId)
      await allowSourceStateUpdate.promise
      await query(sql`/* runConcurrentTestRetainedMembershipProductReconciliation:first source lock */
          SELECT id FROM membership_sources WHERE id = ${options.membershipSourceId} FOR UPDATE`)
      await query(sql`/* runConcurrentTestRetainedMembershipProductReconciliation:source state update */
          UPDATE membership_source_states
          SET should_auto_renew = should_auto_renew
          WHERE membership_source_id = ${options.membershipSourceId}`)
      await transaction.commit()
      return result
    } catch (err) {
      firstValidated.reject(err)
      firstUserLocked.reject(err)
      throw err
    }
  }

  let second: Promise<T> | undefined
  async function runSecondReconciliation(): Promise<T> {
    let client: PoolClient | undefined
    let observation: ReturnType<typeof observeTestTransactionLockNotice> | undefined
    let failure: { reason: unknown } | undefined
    try {
      client = await writePool.connect()
      await using transaction = await beginTransaction({ client })
      const result = await options.validate(transaction)
      secondValidated.resolve()
      observation = observeTestTransactionLockNotice(client, await firstUserLocked.promise)
      await observation.ready
      lockObservation.resolve(observation)
      const userLock = transaction(
        sql`/* runConcurrentTestRetainedMembershipProductReconciliation:second user lock */
            SELECT id FROM users WHERE id = ${options.userId} FOR UPDATE`,
      )
      secondUserLockRequested.resolve()
      await userLock
      await transaction.commit()
      return result
    } catch (err) {
      failure = { reason: err }
      secondValidated.reject(err)
      secondUserLockRequested.reject(err)
      lockObservation.reject(err)
      throw err
    } finally {
      if (client) await releaseMembershipProductContender(client, observation, failure)
    }
  }

  onTestFinished(async () => {
    allowSourceStateUpdate.resolve()
    await Promise.allSettled(second ? [first, second] : [first])
  })
  try {
    await firstValidated.promise
    second = runSecondReconciliation()
    const secondOutcome = Promise.allSettled([second])
    await secondValidated.promise
    await firstUserLocked.promise
    await secondUserLockRequested.promise
    await (await lockObservation.promise).wait(secondOutcome)
    allowSourceStateUpdate.resolve()
    return await Promise.all([first, second])
  } finally {
    allowSourceStateUpdate.resolve()
    await Promise.allSettled(second ? [first, second] : [first])
  }
}

async function releaseMembershipProductContender(
  client: PoolClient,
  observation: ReturnType<typeof observeTestTransactionLockNotice> | undefined,
  failure: { reason: unknown } | undefined,
): Promise<void> {
  try {
    await observation?.close()
  } catch (err) {
    client.release(
      err instanceof Error ? err : new Error('Membership contender cleanup failed', { cause: err }),
    )
    if (failure)
      throw new AggregateError(
        [failure.reason, err],
        'Membership reconciliation and observer cleanup failed',
        { cause: err },
      )
    throw err
  }
  client.release()
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

export async function holdTestMembershipRowLock(
  membershipId: string,
  locked: PromiseWithResolvers<void>,
  release: PromiseWithResolvers<void>,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* holdTestMembershipRowLock */
    SELECT id FROM memberships WHERE id = ${membershipId} FOR UPDATE`)
  locked.resolve()
  await release.promise
  await transaction.commit()
}

export async function holdTestMembershipSourceStateLock(
  membershipSourceId: string,
  locked: PromiseWithResolvers<void>,
  release: PromiseWithResolvers<void>,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* holdTestMembershipSourceStateLock */
    SELECT membership_source_id FROM membership_source_states
    WHERE membership_source_id = ${membershipSourceId} FOR UPDATE`)
  locked.resolve()
  await release.promise
  await transaction.commit()
}

export async function probeTestUserLock(userId: string): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* probeTestUserLock:setTimeout */ SET LOCAL lock_timeout = '50ms'`)
  await transaction(sql`/* probeTestUserLock */
    SELECT id FROM users WHERE id = ${userId} FOR UPDATE`)
  await transaction.commit()
}

export { runTestActionWhileMembershipUserLocked } from './locks/action-while-user-locked.mts'
export { runTestStripeCatalogReconciliationWhileProductReferenced } from './locks/stripe-catalog-fk-hold.mts'
