import { afterEach, describe, expect, it, vi } from 'vitest'

import { poll, waitFor } from '../helpers/wait.mts'

describe('web integration wait helpers', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits between non-overlapping readiness probes', async () => {
    vi.useFakeTimers()
    let activeProbes = 0
    let maxActiveProbes = 0
    let probeCount = 0
    async function probe(): Promise<boolean> {
      probeCount += 1
      activeProbes += 1
      maxActiveProbes = Math.max(maxActiveProbes, activeProbes)
      await Promise.resolve()
      activeProbes -= 1
      return probeCount === 2
    }

    const waiting = waitFor('ordered probe', probe, 1_000, 100)
    await vi.advanceTimersByTimeAsync(0)
    expect(probeCount).toBe(1)

    await vi.advanceTimersByTimeAsync(99)
    expect(probeCount).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    await waiting

    expect(probeCount).toBe(2)
    expect(maxActiveProbes).toBe(1)
  })

  it('waits between non-overlapping polls and returns the accepted value', async () => {
    vi.useFakeTimers()
    let activePolls = 0
    let maxActivePolls = 0
    let pollCount = 0
    async function read(): Promise<number> {
      pollCount += 1
      activePolls += 1
      maxActivePolls = Math.max(maxActivePolls, activePolls)
      await Promise.resolve()
      activePolls -= 1
      return pollCount
    }

    const polling = poll(read, value => value === 2, 1_000, 50)
    await vi.advanceTimersByTimeAsync(49)
    expect(pollCount).toBe(1)
    await vi.advanceTimersByTimeAsync(1)

    await expect(polling).resolves.toBe(2)
    expect(pollCount).toBe(2)
    expect(maxActivePolls).toBe(1)
  })
})
