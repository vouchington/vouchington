import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { ScrollToTop } from '../scroll-to-top'
import {
  consumePreservedScrollPathname,
  preserveScrollForPathname,
} from '@/lib/navigation/scroll-preservation'

let mockPathname = '/initial'

vi.mock(import('next/navigation'), () => ({
  usePathname: () => mockPathname,
}))

describe('ScrollToTop', () => {
  let scrollToSpy: ReturnType<typeof vi.spyOn>
  let mockMatchMedia: ReturnType<typeof vi.fn<(query: string) => MediaQueryList>>

  beforeEach(() => {
    mockPathname = '/initial'
    consumePreservedScrollPathname('/__test_reset__')
    scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
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

  it('does not scroll when an entity tab preserves the destination scroll', () => {
    const { rerender } = render(<ScrollToTop />)

    preserveScrollForPathname('/entity/tags/post')
    mockPathname = '/entity/tags/post'
    rerender(<ScrollToTop />)

    expect(scrollToSpy).not.toHaveBeenCalled()
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
