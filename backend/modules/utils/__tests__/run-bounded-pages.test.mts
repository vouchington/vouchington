import { describe, expect, it, vi } from 'vitest'
import { runBoundedPages } from '../run-bounded-pages.mts'

describe('runBoundedPages', () => {
  it('stops on a short page and reports continuation when the full-page cap is reached', async () => {
    const processPage = vi
      .fn<(size: number) => Promise<number>>()
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
    expect(await runBoundedPages({ batchSize: 2, maxBatches: 5 }, processPage)).toEqual({
      processed: 5,
      hasMore: false,
    })
    expect(processPage.mock.calls).toEqual([[2], [2], [2]])
    const fullPage = vi.fn<(size: number) => Promise<number>>().mockResolvedValue(2)
    expect(await runBoundedPages({ batchSize: 2, maxBatches: 2 }, fullPage)).toEqual({
      processed: 4,
      hasMore: true,
    })
    expect(fullPage).toHaveBeenCalledTimes(2)
  })

  it('requires a positive finite cap before starting any page', async () => {
    const processPage = vi.fn<(size: number) => Promise<number>>()
    for (const maxBatches of [0, -1, 1.5, Infinity, Number.NaN])
      await expect(runBoundedPages({ batchSize: 1, maxBatches }, processPage)).rejects.toThrow(
        'maxBatches must be a positive integer',
      )
    // @ts-expect-error an uncapped runner is forbidden at the type and runtime boundaries
    await expect(runBoundedPages({ batchSize: 1 }, processPage)).rejects.toThrow(
      'maxBatches must be a positive integer',
    )
    expect(processPage).not.toHaveBeenCalled()
  })
})
