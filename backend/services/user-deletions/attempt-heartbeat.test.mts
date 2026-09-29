import { describe, expect, it } from 'vitest'
import { runWithUserDeletionAttemptHeartbeat } from './attempt-heartbeat.mts'

describe('runWithUserDeletionAttemptHeartbeat', () => {
  it('rethrows an Error from a failed heartbeat after the operation', async () => {
    const failure = new Error('renew failed')
    const observed = deferred<void>()
    let calls = 0

    await expect(
      runWithUserDeletionAttemptHeartbeat(
        'request',
        'attempt',
        async () => {
          await observed.promise
          return 'done'
        },
        {
          heartbeatIntervalMs: 5,
          renewAttempt: async () => {
            calls += 1
            if (calls === 1) return true
            observed.resolve()
            throw failure
          },
        },
      ),
    ).rejects.toBe(failure)
  })

  it('renews ownership on the interval and after the operation', async () => {
    const observed = deferred<void>()
    let calls = 0

    await expect(
      runWithUserDeletionAttemptHeartbeat(
        'request',
        'attempt',
        async () => {
          await observed.promise
          return 'done'
        },
        {
          heartbeatIntervalMs: 5,
          renewAttempt: async () => {
            calls += 1
            if (calls === 2) observed.resolve()
            return true
          },
        },
      ),
    ).resolves.toBe('done')
    expect(calls).toBeGreaterThanOrEqual(3)
  })

  it('wraps a non-Error heartbeat failure', async () => {
    const observed = deferred<void>()
    let calls = 0

    await expect(
      runWithUserDeletionAttemptHeartbeat(
        'request',
        'attempt',
        async () => {
          await observed.promise
          return 'done'
        },
        {
          heartbeatIntervalMs: 5,
          renewAttempt: async () => {
            calls += 1
            if (calls === 1) return true
            observed.resolve()
            // oxlint-disable-next-line no-throw-literal, typescript/only-throw-error -- this branch wraps non-Error heartbeat rejections
            throw 'renew failed'
          },
        },
      ),
    ).rejects.toThrow('User deletion heartbeat failed')
  })
})

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
