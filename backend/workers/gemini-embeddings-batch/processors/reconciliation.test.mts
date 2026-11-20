import { describe, expect, it, vi } from 'vitest'
import { processReconciliationPage } from './reconciliation-page.mts'

describe('reconciliation page continuation', () => {
  it.each(['copy:topics', 'copy:posts', 'copy:rss_feed_items', 'post-trigger'])(
    'enqueues exactly one continuation for a full %s page',
    async () => {
      const readPage = vi.fn<() => Promise<{ scannedCount: number; nextCursor: string }>>(
        async () => ({ scannedCount: 100, nextCursor: 'opaque-next' }),
      )
      const enqueue = vi.fn<(after: string) => Promise<{ id: string }>>(async () => ({
        id: 'next',
      }))
      await expect(processReconciliationPage('opaque-after', readPage, enqueue)).resolves.toEqual({
        scannedCount: 100,
        nextCursor: 'opaque-next',
      })
      expect(readPage).toHaveBeenCalledExactlyOnceWith('opaque-after')
      expect(enqueue).toHaveBeenCalledExactlyOnceWith('opaque-next')
    },
  )

  it.each(['copy:topics', 'copy:posts', 'copy:rss_feed_items', 'post-trigger'])(
    'stops after a partial %s page',
    async () => {
      const enqueue = vi.fn<(after: string) => Promise<void>>(async () => undefined)
      await expect(
        processReconciliationPage(
          undefined,
          async () => ({ scannedCount: 4, nextCursor: null }),
          enqueue,
        ),
      ).resolves.toEqual({ scannedCount: 4, nextCursor: null })
      expect(enqueue).not.toHaveBeenCalled()
    },
  )
})
