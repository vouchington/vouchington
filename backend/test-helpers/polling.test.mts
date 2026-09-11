import { describe, expect, it, vi } from 'vitest'
import { waitForCondition, waitForConditionThenObliterate } from './polling.mts'

describe('waitForCondition', () => {
  it('resolves true as soon as the predicate flips true', async () => {
    let calls = 0
    const predicate = vi.fn<() => boolean>(() => {
      calls += 1
      return calls >= 3
    })
    const result = await waitForCondition(predicate, 2000, 5)
    expect(result).toBe(true)
    expect(calls).toBe(3)
  })

  it('resolves false once timeoutMs elapses without the predicate becoming true', async () => {
    const predicate = vi.fn<() => boolean>(() => false)
    const result = await waitForCondition(predicate, 30, 5)
    expect(result).toBe(false)
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
