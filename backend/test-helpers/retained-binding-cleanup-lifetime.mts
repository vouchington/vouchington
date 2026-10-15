import type { TransactionQuery } from '@data-stores/psql'

type Outcome<Result> = { ok: true; result: Result } | { ok: false; error: unknown }
type Operation = { pending: Promise<unknown>; failed: boolean; primary: boolean; error?: unknown }

/** Owns query admissions and one rollback; cleanup is reported only by the registered hook. */
export function createRetainedBindingCleanupLifetime<Result>(
  cleanup: { rollback: () => Promise<void>; dispose: () => Promise<void> },
  registerFinished: (finish: () => Promise<void>) => void,
) {
  const operations: Operation[] = []
  let root: Promise<Outcome<Result>> | undefined
  let finishing: Promise<void> | undefined
  let sealed = false

  class OperationFailure extends Error {
    readonly entry: Operation
    readonly reason: unknown

    constructor(entry: Operation, reason: unknown) {
      super('Owned retained cleanup operation failed', { cause: reason })
      this.entry = entry
      this.reason = reason
    }
  }

  function assertOpen(): void {
    if (sealed) throw new Error('Retained binding cleanup fixture is closing')
  }

  function admit<Value>(operation: () => Promise<Value>): Promise<Value> {
    assertOpen()
    const invoked = Promise.resolve().then(() => {
      assertOpen()
      return operation()
    })
    const entry: Operation = { pending: invoked, failed: false, primary: false }
    const pending = invoked.catch(err => {
      entry.failed = true
      entry.error = err
      throw new OperationFailure(entry, err)
    })
    entry.pending = pending
    operations.push(entry)
    // The complete raw outcome remains in its operation entry, including rejected undefined.
    void pending.catch(() => {})
    return pending
  }

  function run(action: () => Promise<Result>): Promise<Result> {
    if (root || finishing) throw new Error('Retained cleanup fixture root may only start once')
    root = Promise.resolve()
      .then(action)
      .then<Outcome<Result>, Outcome<Result>>(
        result => ({ ok: true, result }),
        err => {
          if (err instanceof OperationFailure) {
            err.entry.primary = true
            return { ok: false, error: err.reason }
          }
          return { ok: false, error: err }
        },
      )
    return root.then(outcome => {
      if (!outcome.ok) throw outcome.error
      return outcome.result
    })
  }

  function finish(): Promise<void> {
    return (finishing ??= drainAndRollback())
  }

  async function drainAndRollback(): Promise<void> {
    const outcome = await root
    sealed = true
    let drained = 0
    while (drained < operations.length) {
      await Promise.allSettled([operations[drained++]!.pending])
    }
    const errors: unknown[] = []
    for (const operation of operations) {
      if (operation.failed && !operation.primary) errors.push(operation.error)
    }
    for (const settle of [cleanup.rollback, cleanup.dispose]) {
      try {
        await settle()
      } catch (err) {
        errors.push(err)
      }
    }
    if (errors.length)
      throw new AggregateError(errors, 'Retained binding cleanup fixture failed', {
        cause: outcome && !outcome.ok ? outcome.error : errors[0],
      })
  }

  registerFinished(finish)
  return {
    assertOpen,
    admit,
    run,
    finish,
    guard(query: TransactionQuery): TransactionQuery {
      return new Proxy(query, {
        apply(target, thisArgument, argumentsList: Parameters<TransactionQuery>) {
          return admit(
            () =>
              Reflect.apply(target, thisArgument, argumentsList) as ReturnType<TransactionQuery>,
          )
        },
      })
    },
  }
}
