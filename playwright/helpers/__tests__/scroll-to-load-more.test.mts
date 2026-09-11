import { describe, expect, it, vi } from 'vitest'
import type { Page } from '@playwright/test'
import { scrollToLoadMore } from '../scroll-to-load-more.mts'

const VIEWPORT = { width: 1280, height: 720 } as const
const BELOW_FOLD_BOX = { x: 0, y: 2000, width: 120, height: 48 }
const IN_VIEW_BOX = { x: 0, y: 80, width: 120, height: 48 }

function createPage(options: {
  counts: number[]
  boxes: Array<typeof BELOW_FOLD_BOX | typeof IN_VIEW_BOX | null>
  remountOnWait?: boolean
}): {
  page: Page
  waitFor: ReturnType<typeof vi.fn<(opts: { state: string; timeout: number }) => Promise<void>>>
} {
  let countCalls = 0
  let boxCalls = 0
  let scrollTop = 0
  const sentinel = {
    count: vi.fn<() => Promise<number>>(async () => {
      const value = options.counts[Math.min(countCalls, options.counts.length - 1)]!
      countCalls += 1
      return value
    }),
    boundingBox: vi.fn<(opts?: { timeout?: number }) => Promise<typeof BELOW_FOLD_BOX | null>>(
      async () => {
        const value = options.boxes[Math.min(boxCalls, options.boxes.length - 1)] ?? null
        boxCalls += 1
        return value
      },
    ),
    waitFor: vi.fn<(opts: { state: string; timeout: number }) => Promise<void>>(async () => {
      if (options.remountOnWait) return
      throw new Error('sentinel still detached')
    }),
  }

  return {
    page: {
      getByTestId: vi.fn<(id: string) => typeof sentinel>(() => sentinel),
      viewportSize: vi.fn<() => typeof VIEWPORT | null>(() => VIEWPORT),
      mouse: {
        move: vi.fn<(x: number, y: number) => Promise<void>>().mockResolvedValue(undefined),
        wheel: vi.fn<(x: number, y: number) => Promise<void>>(async (_x, y) => {
          scrollTop += y
        }),
      },
      evaluate: vi.fn<(fn: () => unknown) => Promise<unknown>>(async fn => {
        const source = Function.prototype.toString.call(fn)
        if (source.includes('scrollTop')) return scrollTop
        if (source.includes('scrollHeight')) {
          return { scrollHeight: 4000, innerHeight: VIEWPORT.height }
        }
        return undefined
      }),
    } as unknown as Page,
    waitFor: sentinel.waitFor,
  }
}

describe('scrollToLoadMore', () => {
  it('succeeds when the sentinel unmounts after it was seen below the fold', async () => {
    const { page } = createPage({
      counts: [1, 1, 0, 0],
      boxes: [BELOW_FOLD_BOX, BELOW_FOLD_BOX],
    })

    await expect(scrollToLoadMore(page)).resolves.toBeUndefined()
    expect(page.mouse.wheel).toHaveBeenCalledTimes(2)
  })

  it('still fails when the sentinel is detached on every attempt', async () => {
    const { page } = createPage({ counts: [0], boxes: [] })

    await expect(scrollToLoadMore(page)).rejects.toThrow(
      /sentinel was detached from the DOM on every attempt/,
    )
  })

  it('probes a remounted sentinel without wheeling past it', async () => {
    const { page, waitFor } = createPage({
      counts: [1, 0, 1],
      boxes: [BELOW_FOLD_BOX, IN_VIEW_BOX],
      remountOnWait: true,
    })

    await expect(scrollToLoadMore(page)).resolves.toBeUndefined()
    expect(waitFor).toHaveBeenCalledOnce()
  })
})
