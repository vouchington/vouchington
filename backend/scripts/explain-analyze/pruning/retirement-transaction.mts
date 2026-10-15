import { beginTransaction, Pool, writePool } from '@data-stores/psql/setup'
import type { PoolClient } from '@data-stores/psql/types'
import { performance } from 'node:perf_hooks'

const remaining = (deadline: number) => {
  const milliseconds = Math.floor(deadline - performance.now())
  if (milliseconds <= 0) throw new Error('Monthly retirement control deadline exceeded')
  return milliseconds
}

export async function openRetirementTransaction(deadline: number) {
  const budget = remaining(deadline)
  // A dedicated normal pool owns its connection attempt. No raced/detached late acquisition.
  const pool = new Pool({
    ...writePool.options,
    max: 1,
    connectionTimeoutMillis: Math.min(budget, 5_000),
    statement_timeout: budget,
    options: `${writePool.options.options ?? ''} -c transaction_timeout=${budget}ms`,
  })
  const observedErrors: Error[] = []
  const clients: PoolClient[] = []
  const clientEnds: Promise<void>[] = []
  const onClientError = (err: Error) => {
    observedErrors.push(new Error('Retirement checked-out client error', { cause: err }))
  }
  const onPoolError = (err: Error) => {
    observedErrors.push(new Error('Retirement idle pool error', { cause: err }))
  }
  // pg-pool emits connect before handing out the client and removing its idle error listener.
  pool.on('connect', connected => {
    clients.push(connected)
    connected.on('error', onClientError)
    clientEnds.push(new Promise<void>(resolveEnd => connected.once('end', resolveEnd)))
  })
  pool.on('error', onPoolError)
  let client: PoolClient | undefined
  let poolClosed = false
  const closePool = async () => {
    poolClosed = true
    const outcomes = await Promise.allSettled([
      Promise.resolve().then(() => pool.end()),
      ...clientEnds,
    ])
    // A pool may remove a client before its physical end event. Retain listeners through both.
    for (const connected of clients) connected.off('error', onClientError)
    pool.off('error', onPoolError)
    const failures = outcomes.flatMap(result =>
      result.status === 'rejected' ? [result.reason] : [],
    )
    failures.push(...observedErrors)
    if (failures.length)
      throw new AggregateError(failures, 'Retirement pool/client end and observed errors', {
        cause: failures[0],
      })
  }
  try {
    client = await pool.connect()
    const transaction = await beginTransaction({ client })
    const dispose = transaction[Symbol.asyncDispose]
    const ownedClient = client
    transaction[Symbol.asyncDispose] = async () => {
      const failures: unknown[] = []
      try {
        await Reflect.apply(dispose, transaction, [])
      } catch (err) {
        failures.push(err)
      }
      try {
        ownedClient.release(failures.length > 0)
      } catch (err) {
        failures.push(err)
      }
      try {
        await closePool()
      } catch (err) {
        failures.push(err)
      }
      if (failures.length === 1) throw failures[0]
      if (failures.length > 1)
        throw new AggregateError(failures, 'Retirement transaction/client/pool closure failed', {
          cause: failures[0],
        })
    }
    try {
      // PG18 terminates only this owned session at the remaining transaction wall budget.
      await transaction(
        "/* monthlyRetirementControlBudget */ SELECT set_config('transaction_timeout', $1, true), set_config('statement_timeout', $1, true)",
        [`${remaining(deadline)}ms`],
      )
      remaining(deadline)
      return transaction
    } catch (err) {
      const [cleanup] = await Promise.allSettled([
        Promise.resolve().then(() => transaction[Symbol.asyncDispose]()),
      ])
      // Disposal above already releases the client and joins its dedicated pool.
      client = undefined
      if (cleanup.status === 'rejected')
        throw new AggregateError(
          [err, cleanup.reason],
          'Retirement deadline setup and disposal failed',
          {
            cause: err,
          },
        )
      throw err
    }
  } catch (err) {
    const failures: unknown[] = [err]
    if (client) {
      try {
        client.release(true)
      } catch (err) {
        failures.push(err)
      }
    }
    if (!poolClosed) {
      try {
        await closePool()
      } catch (err) {
        failures.push(err)
      }
    }
    if (failures.length === 1) throw err
    throw new AggregateError(failures, 'Retirement acquisition and cleanup failed', {
      cause: err,
    })
  }
}
