import { onTestFinished } from 'vitest'

/** Owns test-scoped native queue drains that do not need quota/configuration setup. */
export function createQueueLifetime() {
  const cleanups: Array<() => Promise<void>> = []
  let accepting = true
  let closing: Promise<void> | undefined
  const assertOpen = () => {
    if (!accepting) throw new Error('Owned embedding queue lifetime is closing')
  }
  const close = () => {
    accepting = false
    return (closing ??= dispose())
  }
  onTestFinished(close)
  return {
    assertOpen,
    beforeRelease: (run: () => Promise<void>, _safeAfterFailure?: () => boolean) => {
      assertOpen()
      cleanups.push(run)
    },
  }

  async function dispose() {
    const errors: unknown[] = []
    for (const run of cleanups) {
      try {
        await run()
      } catch (err) {
        errors.push(err)
      }
    }
    if (errors.length)
      throw new AggregateError(errors, 'Owned embedding queue lifetime cleanup failed', {
        cause: errors[0],
      })
  }
}
