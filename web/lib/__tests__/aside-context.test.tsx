import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AsideProvider } from '@/lib/aside-provider'
import { useDesktopAsideOpen, useMobileSheetOpen, useToggleAside } from '@/lib/aside-context'

function wrapper({ children }: { children: ReactNode }) {
  return <AsideProvider>{children}</AsideProvider>
}

describe('AsideProvider default state', () => {
  it('desktopAsideOpen defaults to true', () => {
    const { result } = renderHook(() => useDesktopAsideOpen(), { wrapper })
    expect(result.current).toBe(true)
  })

  it('mobileSheetOpen defaults to false', () => {
    const { result } = renderHook(() => useMobileSheetOpen(), { wrapper })
    expect(result.current).toBe(false)
  })
})

describe('toggleAside on desktop (lg+)', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(min-width: 1024px)',
      media: query,
      onchange: null,
      addListener: vi.fn<VitestLooseMock>(),
      removeListener: vi.fn<VitestLooseMock>(),
      addEventListener: vi.fn<VitestLooseMock>(),
      removeEventListener: vi.fn<VitestLooseMock>(),
      dispatchEvent: vi.fn<VitestLooseMock>(),
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('toggles desktopAsideOpen when on desktop', () => {
    const { result } = renderHook(
      () => ({ open: useDesktopAsideOpen(), toggle: useToggleAside() }),
      { wrapper },
    )

    expect(result.current.open).toBe(true)
    act(() => result.current.toggle())
    expect(result.current.open).toBe(false)
    act(() => result.current.toggle())
    expect(result.current.open).toBe(true)
  })

  it('does not toggle mobileSheetOpen when on desktop', () => {
    const { result } = renderHook(
      () => ({ sheet: useMobileSheetOpen(), toggle: useToggleAside() }),
      { wrapper },
    )

    expect(result.current.sheet).toBe(false)
    act(() => result.current.toggle())
    expect(result.current.sheet).toBe(false)
  })
})

describe('toggleAside on mobile (<lg)', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (_query: string) => ({
      matches: false, // mobile — lg+ does not match
      media: _query,
      onchange: null,
      addListener: vi.fn<VitestLooseMock>(),
      removeListener: vi.fn<VitestLooseMock>(),
      addEventListener: vi.fn<VitestLooseMock>(),
      removeEventListener: vi.fn<VitestLooseMock>(),
      dispatchEvent: vi.fn<VitestLooseMock>(),
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('toggles mobileSheetOpen on mobile', () => {
    const { result } = renderHook(
      () => ({
        sheet: useMobileSheetOpen(),
        open: useDesktopAsideOpen(),
        toggle: useToggleAside(),
      }),
      { wrapper },
    )

    expect(result.current.sheet).toBe(false)
    act(() => result.current.toggle())
    expect(result.current.sheet).toBe(true)
    act(() => result.current.toggle())
    expect(result.current.sheet).toBe(false)
    expect(result.current.open).toBe(true)
  })

  it('does not toggle desktopAsideOpen on mobile', () => {
    const { result } = renderHook(
      () => ({
        open: useDesktopAsideOpen(),
        toggle: useToggleAside(),
      }),
      { wrapper },
    )

    expect(result.current.open).toBe(true)
    act(() => result.current.toggle())
    expect(result.current.open).toBe(true)
  })
})
