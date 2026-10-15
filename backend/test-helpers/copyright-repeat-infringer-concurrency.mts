import { beginTransaction, type PoolClient } from '@data-stores/psql'
import { recordCopyrightRepeatInfringerReviewOutcome } from '../services/copyright-notices/repeat-infringer-outcomes.mts'
import { withTestCopyrightAuthorLock } from './copyright-author-lock-owner.mts'

export type TestCopyrightConnection = { client: PoolClient }
type Connection = TestCopyrightConnection
type Action<T = unknown> = (connection: Connection) => Promise<T>

/** The existing joined API keeps post-commit actions on this actual, explicitly committed owner. */
export async function runTestCopyrightReviewOutcome(
  input: Parameters<typeof recordCopyrightRepeatInfringerReviewOutcome>[0],
  connection: Connection,
) {
  await using transaction = await beginTransaction(connection)
  const result = await recordCopyrightRepeatInfringerReviewOutcome(input, { query: transaction })
  await transaction.commit()
  return result
}

export async function confirmTestRepeatInfringerNoticesConcurrently(
  accountId: string,
  operations: Action[],
): Promise<void> {
  await withTestCopyrightAuthorLock(accountId, operations.length, async owner => {
    const actions = operations.map((operation, index) => owner.start(index, operation))
    await Promise.all(actions.map(action => action.wait()))
    await owner.release()
    const outcomes = (await Promise.all(actions.map(action => action.settled))).flat()
    const failures = outcomes.flatMap(outcome =>
      outcome.status === 'rejected' ? [outcome.reason] : [],
    )
    if (failures.length === 1) {
      const failure = Promise.withResolvers<never>()
      failure.reject(failures[0])
      return failure.promise
    }
    if (failures.length)
      throw new AggregateError(failures, 'Copyright confirmations failed', { cause: failures[0] })
  })
}

export async function observeTestRepeatInfringerAuthorLock<Result, Observation>(input: {
  accountId: string
  operation: Action<Result>
  observe: () => Promise<Observation>
}): Promise<{ result: Result; observation: Observation }> {
  return withTestCopyrightAuthorLock(input.accountId, 1, async owner => {
    const action = owner.start(0, input.operation)
    await action.wait()
    const observation = await input.observe()
    await owner.release()
    const [outcome] = await action.settled
    if (outcome?.status !== 'fulfilled') {
      const failure = Promise.withResolvers<never>()
      failure.reject(outcome?.reason)
      return failure.promise
    }
    return { result: outcome.value, observation }
  })
}

export async function raceTestRepeatInfringerAuthorLock(input: {
  accountId: string
  operations: Action[]
}): Promise<PromiseSettledResult<unknown>[]> {
  return withTestCopyrightAuthorLock(input.accountId, input.operations.length, async owner => {
    const actions = []
    for (const [index, operation] of input.operations.entries()) {
      const action = owner.start(index, operation)
      actions.push(action)
      await action.wait()
    }
    await owner.release()
    return (await Promise.all(actions.map(action => action.settled))).flat()
  })
}
