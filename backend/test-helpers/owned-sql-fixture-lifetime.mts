import { onTestFinished } from 'vitest'

/** Joins admitted finite producers, never the caller's arbitrary test body. */
export function createOwnedSqlFixtureLifetime(release: () => Promise<void>) {
  const prepared = Promise.withResolvers<void>()
  const operations: Promise<unknown>[] = []
  const resourceDrains: Array<() => Promise<void>> = []
  let closing = false
  let disposal: Promise<void> | undefined
  let preparationStarted = false
  const assertOpen = () => {
    if (closing) throw new Error('Owned SQL fixture is closing')
  }
  const close = () => {
    closing = true
    if (!preparationStarted) prepared.resolve()
    return (disposal ??= dispose())
  }
  onTestFinished(close)
  async function dispose() {
    await prepared.promise
    // A complete producer can issue several SQL calls; settle that entire operation first.
    for (const operation of operations) await Promise.allSettled([operation])
    const failures: unknown[] = []
    for (const drain of resourceDrains) {
      try {
        await drain()
      } catch (err) {
        failures.push(err)
      }
    }
    try {
      await release()
    } catch (err) {
      failures.push(err)
    }
    if (failures.length) throw new AggregateError(failures, 'Owned SQL resource cleanup failed')
  }
  function run<Result>(operation: () => Promise<Result>): Promise<Result> {
    assertOpen()
    const pending = Promise.withResolvers<Result>()
    operations.push(pending.promise)
    void pending.promise.catch(() => {})
    // Register settlement before invoking the real producer, including synchronous throws.
    try {
      pending.resolve(operation())
    } catch (err) {
      pending.reject(err)
    }
    return pending.promise
  }
  return {
    assertOpen,
    close,
    beforeRelease(drain: () => Promise<void>) {
      assertOpen()
      resourceDrains.push(drain)
    },
    async prepare(operation: () => Promise<void>) {
      if (preparationStarted) throw new Error('Owned SQL fixture was already prepared')
      preparationStarted = true
      try {
        assertOpen()
        await operation()
        assertOpen()
      } finally {
        prepared.resolve()
      }
    },
    run,
    operation<Arguments extends unknown[], Result>(
      operation: (...args: Arguments) => Promise<Result>,
    ) {
      return (...args: Arguments) => run(() => operation(...args))
    },
    async withBody<Result>(operation: () => Promise<Result>): Promise<Result> {
      let result: { ok: true; value: Result } | { ok: false; error: unknown }
      try {
        result = { ok: true, value: await operation() }
      } catch (err) {
        result = { ok: false, error: err }
      }
      try {
        await close()
      } catch (err) {
        if (!result.ok)
          throw new AggregateError([result.error, err], 'Owned SQL body and cleanup failed', {
            cause: err,
          })
        throw err
      }
      if (!result.ok) throw result.error
      return result.value
    },
  }
}
