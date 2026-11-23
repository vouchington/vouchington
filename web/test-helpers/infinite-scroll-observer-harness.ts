import { afterEach, beforeEach, vi } from 'vitest'

import { cleanup } from '@testing-library/react'

/**
 * Registers the beforeEach/afterEach that stub IntersectionObserver and requestAnimationFrame for
 * InfiniteScroll tests, and returns the handles the tests drive them with. Call inside `describe`.
 */
export function setupInfiniteScrollObserverHarness() {
  let intersectionCallback: IntersectionObserverCallback

  const mockObserve = vi.fn<VitestLooseMock>()

  const mockUnobserve = vi.fn<VitestLooseMock>()

  const mockDisconnect = vi.fn<VitestLooseMock>()

  // requestAnimationFrame mock: captures callbacks so tests can control when they fire
  const rafCallbacks = new Map<number, FrameRequestCallback>()

  let rafIdCounter = 0

  const mockRaf = vi.fn<VitestLooseMock>().mockImplementation((cb: FrameRequestCallback) => {
    const id = ++rafIdCounter
    rafCallbacks.set(id, cb)
    return id
  })

  const mockCancelRaf = vi.fn<VitestLooseMock>().mockImplementation((id: number) => {
    rafCallbacks.delete(id)
  })

  beforeEach(() => {
    rafCallbacks.clear()
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)

    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback
      }
      observe = mockObserve
      unobserve = mockUnobserve
      disconnect = mockDisconnect
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

    // Default: page is scrollable (content taller than viewport) so the scroll
    // gate stays closed until the user explicitly scrolls.
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000)
  })

  afterEach(() => {
    // Unmount before clearing mocks: the global setup's afterEach also calls cleanup(), but
    // registration order runs it after this describe's afterEach, so a still-mounted component's
    // effect-cleanup disconnect() would otherwise be counted against the *next* test instead of
    // this one.
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    mockObserve.mockClear()
    mockUnobserve.mockClear()
    mockDisconnect.mockClear()
    mockRaf.mockClear()
    mockCancelRaf.mockClear()
  })

  /** Run all pending requestAnimationFrame callbacks. */
  function flushRaf() {
    const cbs = [...rafCallbacks.values()]
    rafCallbacks.clear()
    for (const cb of cbs) cb(0)
  }

  function triggerIntersection(isIntersecting: boolean) {
    intersectionCallback(
      [{ isIntersecting } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
  }

  /** Open the scroll gate (simulates first user scroll). */
  function triggerScroll() {
    window.dispatchEvent(new Event('scroll'))
  }

  return { mockObserve, mockDisconnect, rafCallbacks, flushRaf, triggerIntersection, triggerScroll }
}
