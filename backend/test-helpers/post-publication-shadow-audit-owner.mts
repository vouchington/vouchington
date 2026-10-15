import type { TransactionQuery } from '@data-stores/psql'

/** Register before acquisition; fence admission and await the complete growing lifetime. */
export function createTestShadowAuditOwner() {
  const operations: Promise<unknown>[] = []
  const completed = Promise.withResolvers<void>()
  const failures: unknown[] = []
  const rejected: unknown[] = []
  let drained = 0
  let closed = false
  let failed = false
  let primary: unknown
  const assertOpen = () => {
    if (closed) throw new Error('Shadow audit proof owner is closing')
  }
  const assertCleanup = () => {
    if (rejected.length || failures.length)
      throw new AggregateError([...rejected, ...failures], 'Shadow audit proof cleanup failed', {
        cause: failed ? primary : rejected.length ? rejected[0] : failures[0],
      })
  }
  function admit<Result>(operation: () => Promise<Result>): Promise<Result> {
    assertOpen()
    const pending = Promise.resolve().then(() => {
      assertOpen()
      return operation()
    })
    operations.push(pending)
    void pending.catch(() => {})
    return pending
  }
  return {
    assertOpen,
    admit,
    async finish() {
      closed = true
      await completed.promise
      assertCleanup()
    },
    guard(query: TransactionQuery): TransactionQuery {
      return new Proxy(query, {
        apply(target, thisArgument, argumentsList: Parameters<TransactionQuery>) {
          assertOpen()
          return Reflect.apply(target, thisArgument, argumentsList) as ReturnType<TransactionQuery>
        },
      })
    },
    async drain() {
      closed = true
      // Retain each outcome once, including rejected undefined, in admission order.
      while (drained < operations.length) {
        const [outcome] = await Promise.allSettled([operations[drained++]!])
        if (outcome!.status === 'rejected') rejected.push(outcome!.reason)
      }
    },
    fail(error: unknown) {
      if (failed) failures.push(error)
      else {
        failed = true
        primary = error
      }
    },
    cleanupFailure(error: unknown) {
      failures.push(error)
    },
    complete() {
      completed.resolve()
    },
    assertResult() {
      assertCleanup()
      if (failed) throw primary
    },
  }
}
