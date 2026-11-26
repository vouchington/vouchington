import { describe, expect, it } from 'vitest'
import { startWithStalledDownloadRetry } from './aws-emulator-download-attempts.mts'

function stalledUntilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason as Error), { once: true })
  })
}

describe('AWS Emulator download attempts', () => {
  it('starts again after a stalled attempt and returns the next attempt', async () => {
    let attempts = 0
    const started = await startWithStalledDownloadRetry(
      signal => {
        attempts += 1
        return attempts === 1 ? stalledUntilAborted(signal) : Promise.resolve('started')
      },
      { attempts: 3, deadlineMs: 1 },
    )
    expect(started).toBe('started')
    expect(attempts).toBe(2)
  })

  it('gives each attempt a fresh deadline', async () => {
    const signals: AbortSignal[] = []
    await startWithStalledDownloadRetry(
      signal => {
        signals.push(signal)
        return signals.length < 3 ? stalledUntilAborted(signal) : Promise.resolve('started')
      },
      { attempts: 3, deadlineMs: 1 },
    )
    expect(new Set(signals).size).toBe(3)
  })

  it('throws the last stall once the attempts are spent', async () => {
    let attempts = 0
    await expect(
      startWithStalledDownloadRetry(
        signal => {
          attempts += 1
          return stalledUntilAborted(signal)
        },
        { attempts: 2, deadlineMs: 1 },
      ),
    ).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(attempts).toBe(2)
  })

  it('does not retry a failure that is not the deadline', async () => {
    const failure = new Error('AWS Emulator package digest does not match pinned')
    let attempts = 0
    await expect(
      startWithStalledDownloadRetry(
        () => {
          attempts += 1
          return Promise.reject(failure)
        },
        { attempts: 3, deadlineMs: 60_000 },
      ),
    ).rejects.toBe(failure)
    expect(attempts).toBe(1)
  })
})
