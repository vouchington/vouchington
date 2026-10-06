import { describe, expect, it, vi } from 'vitest'
import { runThenCleanup } from './run-then-cleanup.mts'

describe('runThenCleanup', () => {
  it('returns the result after cleaning up', async () => {
    const cleanup = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)

    await expect(runThenCleanup(() => Promise.resolve('ok'), cleanup)).resolves.toBe('ok')
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('reports a cleanup failure when the run succeeded', async () => {
    const cleanupFailure = new Error('cleanup failed')

    await expect(
      runThenCleanup(
        () => Promise.resolve('ok'),
        () => Promise.reject(cleanupFailure),
      ),
    ).rejects.toBe(cleanupFailure)
  })

  it('rethrows the run failure after cleaning up', async () => {
    const failure = new Error('run failed')
    const cleanup = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)

    await expect(runThenCleanup(() => Promise.reject(failure), cleanup)).rejects.toBe(failure)
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('never lets a cleanup failure replace the run failure', async () => {
    const failure = new Error('run failed')
    const cleanup = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('cleanup failed'))

    await expect(runThenCleanup(() => Promise.reject(failure), cleanup)).rejects.toBe(failure)
    expect(cleanup).toHaveBeenCalledOnce()
  })
})
