import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Page } from '@playwright/test'
import { waitForBelowFoldHydration } from '../wait-for-hydration.mts'

function createEvaluatePage() {
  return {
    evaluate: vi.fn<(callback: () => Promise<void>) => Promise<void>>(callback => callback()),
  } as unknown as Page
}

describe('waitForBelowFoldHydration', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('waits for requestIdleCallback when available', async () => {
    const page = createEvaluatePage()
    const requestIdleCallback = vi.fn<typeof globalThis.requestIdleCallback>(callback => {
      callback({ didTimeout: false, timeRemaining: () => 0 })
      return 1
    })

    vi.stubGlobal('window', { requestIdleCallback })

    await waitForBelowFoldHydration(page)

    expect(requestIdleCallback).toHaveBeenCalledOnce()
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 500 })
  })

  it('falls back to animation frames without a fixed sleep', async () => {
    const page = createEvaluatePage()
    const frameCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrame = vi.fn<typeof globalThis.requestAnimationFrame>(callback => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    })

    vi.stubGlobal('window', {})
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)

    const waitPromise = waitForBelowFoldHydration(page)
    expect(requestAnimationFrame).toHaveBeenCalledOnce()

    frameCallbacks.shift()?.(0)
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2)

    frameCallbacks.shift()?.(16)
    await waitPromise
  })

  it('resolves if fallback animation frames are throttled', async () => {
    vi.useFakeTimers()
    const page = createEvaluatePage()
    const requestAnimationFrame = vi.fn<typeof globalThis.requestAnimationFrame>(() => 1)

    vi.stubGlobal('window', {})
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)

    const waitPromise = waitForBelowFoldHydration(page)
    expect(requestAnimationFrame).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(50)
    await waitPromise
    expect(requestAnimationFrame).toHaveBeenCalledOnce()
  })
})
