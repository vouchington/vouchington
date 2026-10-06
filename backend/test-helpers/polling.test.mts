import { describe, expect, it, vi } from 'vitest'
import { pollUntilNotNull, waitForCondition, waitForConditionThenObliterate } from './polling.mts'

describe('pollUntilNotNull', () => {
  it('resolves the first non-null value', async () => {
    let calls = 0
    const fn = vi.fn<() => Promise<string | null>>(async () => {
      calls += 1
      return calls >= 3 ? 'ready' : null
    })
    await expect(pollUntilNotNull(fn, 2000, 5)).resolves.toBe('ready')
    expect(calls).toBe(3)
  })

  it('treats falsy but non-null values as present', async () => {
    await expect(pollUntilNotNull(async () => 0, 2000, 5)).resolves.toBe(0)
  })

  it('throws, naming what it waited for, once maxMs elapses without a value', async () => {
    const fn = vi.fn<() => Promise<null>>(async () => null)
    await expect(pollUntilNotNull(fn, 30, 5, 'the ledger row')).rejects.toThrow(
      'Timed out waiting for the ledger row (after 30ms)',
    )
    expect(fn).toHaveBeenCalled()
  })

  it('still reads once when the deadline has already passed', async () => {
    await expect(pollUntilNotNull(async () => 'present', 0)).resolves.toBe('present')
  })
})

describe('waitForCondition', () => {
  it('resolves as soon as the predicate flips true', async () => {
    let calls = 0
    const predicate = vi.fn<() => boolean>(() => {
      calls += 1
      return calls >= 3
    })
    await expect(waitForCondition(predicate, 2000, 5)).resolves.toBeUndefined()
    expect(calls).toBe(3)
  })

  it('throws, naming the condition, once timeoutMs elapses without the predicate becoming true', async () => {
    const predicate = vi.fn<() => boolean>(() => false)
    await expect(waitForCondition(predicate, 30, 5, 'the row to land')).rejects.toThrow(
      'Timed out waiting for the row to land (after 30ms)',
    )
    expect(predicate).toHaveBeenCalled()
  })
})

describe('waitForConditionThenObliterate', () => {
  it('obliterates the queue once the condition is met, and not before', async () => {
    let ready = false
    queueMicrotask(() => {
      ready = true
    })
    const obliterate = vi
      .fn<(opts?: { force?: boolean }) => Promise<void>>()
      .mockResolvedValue(undefined)
    await waitForConditionThenObliterate({ obliterate }, () => ready, 2000, 5)
    expect(obliterate).toHaveBeenCalledTimes(1)
    expect(obliterate).toHaveBeenCalledWith({ force: true })
  })

  it('throws and never obliterates when the condition never becomes true', async () => {
    const obliterate = vi
      .fn<(opts?: { force?: boolean }) => Promise<void>>()
      .mockResolvedValue(undefined)
    await expect(
      waitForConditionThenObliterate({ obliterate }, () => false, 30, 5),
    ).rejects.toThrow('Timed out waiting for condition before obliterating the test queue')
    expect(obliterate).not.toHaveBeenCalled()
  })
})
