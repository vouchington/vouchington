import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { ScrollToTop } from '../scroll-to-top'
import {
  consumePreservedScrollPosition,
  preserveScrollForPathname,
} from '@/lib/navigation/scroll-preservation'

let mockPathname = '/initial'
vi.mock(import('next/navigation'), () => ({
  usePathname: () => mockPathname,
}))

describe('ScrollToTop', () => {
  let scrollToSpy: ReturnType<typeof vi.spyOn>
  let resizeObserverCallback: ResizeObserverCallback
  let resizeObserverDisconnect: ReturnType<typeof vi.fn>
  let htmlScrollHeight: PropertyDescriptor | undefined
  let bodyScrollHeight: PropertyDescriptor | undefined
  let innerHeight: PropertyDescriptor | undefined
  let scrollY: PropertyDescriptor | undefined
  let mockMatchMedia: ReturnType<typeof vi.fn<(query: string) => MediaQueryList>>

  beforeEach(() => {
    mockPathname = '/initial'
    consumePreservedScrollPosition('/__test_reset__')
    scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 320 })
    })
    resizeObserverDisconnect = vi.fn<() => void>()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeObserverCallback = callback
        }

        observe = vi.fn<(target: Element, options?: ResizeObserverOptions) => void>()
        disconnect = resizeObserverDisconnect
        unobserve = vi.fn<(target: Element) => void>()
      },
    )
    htmlScrollHeight = Object.getOwnPropertyDescriptor(document.documentElement, 'scrollHeight')
    bodyScrollHeight = Object.getOwnPropertyDescriptor(document.body, 'scrollHeight')
    innerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')
    scrollY = Object.getOwnPropertyDescriptor(window, 'scrollY')
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 300,
    })
    Object.defineProperty(document.body, 'scrollHeight', { configurable: true, value: 300 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 200 })
    mockMatchMedia = vi.fn<(query: string) => MediaQueryList>(query => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn<() => void>(),
      removeListener: vi.fn<() => void>(),
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
      dispatchEvent: vi.fn<() => boolean>(),
    }))
    vi.stubGlobal('matchMedia', mockMatchMedia)
  })

  afterEach(() => {
    scrollToSpy.mockRestore()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    if (htmlScrollHeight)
      Object.defineProperty(document.documentElement, 'scrollHeight', htmlScrollHeight)
    if (bodyScrollHeight) Object.defineProperty(document.body, 'scrollHeight', bodyScrollHeight)
    if (innerHeight) Object.defineProperty(window, 'innerHeight', innerHeight)
    if (scrollY) Object.defineProperty(window, 'scrollY', scrollY)
    document.body.innerHTML = ''
  })

  it('does not scroll to top on initial mount', () => {
    render(<ScrollToTop />)
    expect(scrollToSpy).not.toHaveBeenCalled()
  })

  it('scrolls to top when the pathname changes', () => {
    const { rerender } = render(<ScrollToTop />)
    expect(scrollToSpy).not.toHaveBeenCalled()

    mockPathname = '/new-page'
    rerender(<ScrollToTop />)

    expect(scrollToSpy).toHaveBeenCalledOnce()
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' })
  })

  it('focuses the primary route target on desktop pathname changes', () => {
    vi.useFakeTimers()
    const input = document.createElement('input')
    input.setAttribute('data-route-focus-target', 'primary')
    document.body.append(input)
    const focusSpy = vi.spyOn(input, 'focus')
    const { rerender } = render(<ScrollToTop />)

    mockPathname = '/new-page'
    rerender(<ScrollToTop />)
    vi.runAllTimers()

    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
    expect(document.activeElement).toBe(input)
  })

  it('does not focus the primary route target on mobile pathname changes', () => {
    vi.useFakeTimers()
    mockMatchMedia.mockReturnValue({
      matches: false,
      media: '(min-width: 768px)',
      onchange: null,
      addListener: vi.fn<() => void>(),
      removeListener: vi.fn<() => void>(),
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
      dispatchEvent: vi.fn<() => boolean>(),
    } as MediaQueryList)
    const input = document.createElement('input')
    input.setAttribute('data-route-focus-target', 'primary')
    document.body.append(input)
    const focusSpy = vi.spyOn(input, 'focus')
    const { rerender } = render(<ScrollToTop />)

    mockPathname = '/new-page'
    rerender(<ScrollToTop />)
    vi.runAllTimers()

    expect(focusSpy).not.toHaveBeenCalled()
  })

  it('does not focus disabled primary route targets', () => {
    vi.useFakeTimers()
    const input = document.createElement('input')
    input.setAttribute('data-route-focus-target', 'primary')
    input.disabled = true
    document.body.append(input)
    const focusSpy = vi.spyOn(input, 'focus')
    const { rerender } = render(<ScrollToTop />)

    mockPathname = '/new-page'
    rerender(<ScrollToTop />)
    vi.runAllTimers()

    expect(focusSpy).not.toHaveBeenCalled()
  })

  it('does not scroll again when re-rendering with the same pathname', () => {
    const { rerender } = render(<ScrollToTop />)

    mockPathname = '/page-a'
    rerender(<ScrollToTop />)
    expect(scrollToSpy).toHaveBeenCalledTimes(1)

    rerender(<ScrollToTop />)
    expect(scrollToSpy).toHaveBeenCalledTimes(1)
  })

  it('does not scroll when window.location.hash is set', () => {
    window.history.pushState({}, '', '#section-1')
    try {
      const { rerender } = render(<ScrollToTop />)

      mockPathname = '/page-with-anchor'
      rerender(<ScrollToTop />)

      expect(scrollToSpy).not.toHaveBeenCalled()
    } finally {
      window.history.pushState({}, '', '/initial')
    }
  })

  it('does not scroll on popstate (Back/Forward) navigation', () => {
    const { rerender } = render(<ScrollToTop />)

    // Simulate popstate setting window.location.pathname to the destination.
    window.history.pushState({}, '', '/page-back')
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))

    mockPathname = '/page-back'
    rerender(<ScrollToTop />)

    expect(scrollToSpy).not.toHaveBeenCalled()

    window.history.pushState({}, '', '/initial')
  })

  it('scrolls on a forward navigation after a same-pathname popstate', () => {
    // Same-pathname Back/Forward (e.g. filter-param history entry):
    // popstate fires but usePathname() does not change, so the flag must
    // not persist and poison the next forward navigation.
    const { rerender } = render(<ScrollToTop />)

    // Popstate that changes only search params — pathname stays '/initial'.
    window.history.pushState({}, '', '/initial?q=old')
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    // pathname effect does not re-run — scrollToSpy still not called.
    expect(scrollToSpy).not.toHaveBeenCalled()

    // Now a real forward navigation to a new pathname must scroll.
    window.history.pushState({}, '', '/page-forward')
    mockPathname = '/page-forward'
    rerender(<ScrollToTop />)
    expect(scrollToSpy).toHaveBeenCalledOnce()

    window.history.pushState({}, '', '/initial')
  })

  it('scrolls again after a cross-pathname popstate is consumed', () => {
    const { rerender } = render(<ScrollToTop />)

    // Popstate cross-pathname back — no scroll.
    window.history.pushState({}, '', '/page-back')
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    mockPathname = '/page-back'
    rerender(<ScrollToTop />)
    expect(scrollToSpy).not.toHaveBeenCalled()

    // Forward navigation immediately after — scroll should reset.
    window.history.pushState({}, '', '/page-forward')
    mockPathname = '/page-forward'
    rerender(<ScrollToTop />)
    expect(scrollToSpy).toHaveBeenCalledOnce()

    window.history.pushState({}, '', '/initial')
  })

  it('scrolls each time the pathname changes to a new value', () => {
    const { rerender } = render(<ScrollToTop />)

    mockPathname = '/page-a'
    rerender(<ScrollToTop />)

    mockPathname = '/page-b'
    rerender(<ScrollToTop />)

    expect(scrollToSpy).toHaveBeenCalledTimes(2)
  })

  it('restores the saved position when the destination becomes tall enough', () => {
    const { rerender } = render(<ScrollToTop />)

    preserveScrollForPathname('/entity/tags/post', 320)
    mockPathname = '/entity/tags/post'
    rerender(<ScrollToTop />)

    expect(scrollToSpy).not.toHaveBeenCalled()

    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 600,
    })
    resizeObserverCallback([], {} as ResizeObserver)

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 320, left: 0, behavior: 'instant' })
    expect(resizeObserverDisconnect).toHaveBeenCalledOnce()
  })

  it('scrolls when a preserved destination does not match the next pathname', () => {
    const { rerender } = render(<ScrollToTop />)

    preserveScrollForPathname('/entity/tags/post')
    mockPathname = '/other-page'
    rerender(<ScrollToTop />)

    expect(scrollToSpy).toHaveBeenCalledOnce()

    mockPathname = '/entity/tags/post'
    rerender(<ScrollToTop />)

    expect(scrollToSpy).toHaveBeenCalledTimes(2)
  })
})
