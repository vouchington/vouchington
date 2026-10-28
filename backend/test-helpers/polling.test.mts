import { afterEach, describe, expect, it, vi } from 'vitest'
import assert from 'node:assert/strict'
import { pollUntilNotNull } from './polling.mts'

describe('pollUntilNotNull', () => {
  afterEach(() => vi.useRealTimers())

  it('resolves the first non-null value', async () => {
    vi.useFakeTimers()
    let calls = 0
    const fn = vi.fn<() => Promise<string | null>>(async () => {
      calls += 1
      return calls >= 3 ? 'ready' : null
    })
    const result = pollUntilNotNull(fn, 2000, 5)
    await vi.advanceTimersByTimeAsync(10)
    assert.equal(await result, 'ready')
    expect(calls).toBe(3)
  })

  it('treats falsy but non-null values as present', async () => {
    await expect(pollUntilNotNull(async () => 0, 2000, 5)).resolves.toBe(0)
  })

  it('throws, naming what it waited for, once maxMs elapses without a value', async () => {
    vi.useFakeTimers()
    const fn = vi.fn<() => Promise<null>>(async () => null)
    await Promise.all([
      assert.rejects(pollUntilNotNull(fn, 30, 5, 'the ledger row'), {
        message: 'Timed out waiting for the ledger row (after 30ms)',
      }),
      vi.advanceTimersByTimeAsync(30),
    ])
    expect(fn).toHaveBeenCalled()
  })

  it('still reads once when the deadline has already passed', async () => {
    await expect(pollUntilNotNull(async () => 'present', 0)).resolves.toBe('present')
  })
})
