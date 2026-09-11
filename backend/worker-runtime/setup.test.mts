import { it, expect, describe, vi } from 'vitest'
import { runHygieneSweeps } from './setup.mts'

describe('runHygieneSweeps', () => {
  it('resolves without throwing when the real sweeps succeed', async () => {
    await expect(runHygieneSweeps()).resolves.toBeUndefined()
  })

  it('reports a rejected sweep via onError instead of throwing', async () => {
    const sweepError = new Error('sweep boom')
    const failingSweep = vi.fn<() => Promise<void>>().mockRejectedValue(sweepError)

    await expect(runHygieneSweeps([failingSweep])).resolves.toBeUndefined()
    expect(failingSweep).toHaveBeenCalledOnce()
  })
})
