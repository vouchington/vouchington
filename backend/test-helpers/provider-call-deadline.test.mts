import { describe, expect, it } from 'vitest'
import {
  callWithDeadline,
  callWithDeadlineAndOneRetry,
  ProviderCallDeadlineError,
} from './provider-call-deadline.mts'

function stalledUntilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason as Error), { once: true })
  })
}

describe('live provider call deadline', () => {
  it('fails a stalled call with an error naming it', async () => {
    const stalled = callWithDeadline('fixture-a', 1, stalledUntilAborted)
    await expect(stalled).rejects.toBeInstanceOf(ProviderCallDeadlineError)
    await expect(stalled).rejects.toThrow('fixture-a: no provider response within 1ms')
  })

  it('does not hide a provider failure behind a deadline error', async () => {
    const failure = new Error('provider rejected the request')
    await expect(callWithDeadline('fixture-b', 1_000, () => Promise.reject(failure))).rejects.toBe(
      failure,
    )
  })

  it('retries a failed attempt once and no more', async () => {
    let calls = 0
    const answered = await callWithDeadlineAndOneRetry('fixture-c', 1_000, () => {
      calls += 1
      return calls === 1 ? Promise.reject(new Error('transient')) : Promise.resolve('ok')
    })
    expect(answered).toBe('ok')

    calls = 0
    await expect(
      callWithDeadlineAndOneRetry('fixture-d', 1_000, () => {
        calls += 1
        return Promise.reject(new Error(`attempt ${calls}`))
      }),
    ).rejects.toThrow('attempt 2')
    expect(calls).toBe(2)
  })
})
