import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { ThemeProvider } from '../theme-context'
import { useTheme } from '../use-theme'

const mockAddEventListener = vi.fn<VitestLooseMock>()
const mockRemoveEventListener = vi.fn<VitestLooseMock>()

function setupMatchMedia(matches = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn<VitestLooseMock>().mockReturnValue({
      matches,
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
    }),
  })
}

function ThemeConsumer({ onRender }: { onRender: (v: ReturnType<typeof useTheme>) => void }) {
  const value = useTheme()
  onRender(value)
  return null
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    document.documentElement.className = ''
    localStorage.clear()
    setupMatchMedia(false)
    mockAddEventListener.mockClear()
    mockRemoveEventListener.mockClear()
  })

  it('initializes with default theme when localStorage is empty', () => {
    let captured: ReturnType<typeof useTheme> | null = null
    render(
      <ThemeProvider>
        <ThemeConsumer onRender={v => (captured = v)} />
      </ThemeProvider>,
    )
    expect(captured!.theme).toBe('dark')
  })

  it('setTheme writes to localStorage', () => {
    let captured: ReturnType<typeof useTheme> | null = null
    render(
      <ThemeProvider>
        <ThemeConsumer onRender={v => (captured = v)} />
      </ThemeProvider>,
    )
    act(() => captured!.setTheme('dark'))
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('setTheme to dark adds .dark class to html', () => {
    let captured: ReturnType<typeof useTheme> | null = null
    render(
      <ThemeProvider>
        <ThemeConsumer onRender={v => (captured = v)} />
      </ThemeProvider>,
    )
    act(() => captured!.setTheme('dark'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('setTheme to light removes .dark class from html', () => {
    document.documentElement.classList.add('dark')
    let captured: ReturnType<typeof useTheme> | null = null
    render(
      <ThemeProvider>
        <ThemeConsumer onRender={v => (captured = v)} />
      </ThemeProvider>,
    )
    act(() => captured!.setTheme('light'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('setTheme to system applies dark when prefers-color-scheme is dark', () => {
    setupMatchMedia(true)
    let captured: ReturnType<typeof useTheme> | null = null
    render(
      <ThemeProvider>
        <ThemeConsumer onRender={v => (captured = v)} />
      </ThemeProvider>,
    )
    act(() => captured!.setTheme('system'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('setTheme to system removes dark when prefers-color-scheme is light', () => {
    document.documentElement.classList.add('dark')
    setupMatchMedia(false)
    let captured: ReturnType<typeof useTheme> | null = null
    render(
      <ThemeProvider>
        <ThemeConsumer onRender={v => (captured = v)} />
      </ThemeProvider>,
    )
    act(() => captured!.setTheme('system'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('registers prefers-color-scheme listener when theme is system', () => {
    localStorage.setItem('theme', 'system')
    render(
      <ThemeProvider>
        <ThemeConsumer onRender={() => {}} />
      </ThemeProvider>,
    )
    expect(mockAddEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('does not register prefers-color-scheme listener when theme is not system', () => {
    localStorage.setItem('theme', 'dark')
    render(
      <ThemeProvider>
        <ThemeConsumer onRender={() => {}} />
      </ThemeProvider>,
    )
    expect(mockAddEventListener).not.toHaveBeenCalled()
  })

  it('syncs state from localStorage on mount when value differs from default', () => {
    localStorage.setItem('theme', 'dark')
    let captured: ReturnType<typeof useTheme> | null = null
    render(
      <ThemeProvider>
        <ThemeConsumer onRender={v => (captured = v)} />
      </ThemeProvider>,
    )
    expect(captured!.theme).toBe('dark')
  })

  it('applies dark class to html on mount when stored theme is dark', () => {
    // Verify mount-time restoration: ThemeProvider re-applies the class after
    // React hydration wipes the html element's class attribute.
    localStorage.setItem('theme', 'dark')
    render(
      <ThemeProvider>
        <ThemeConsumer onRender={() => {}} />
      </ThemeProvider>,
    )
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('does not add dark class to html on mount when stored theme is light', () => {
    localStorage.setItem('theme', 'light')
    render(
      <ThemeProvider>
        <ThemeConsumer onRender={() => {}} />
      </ThemeProvider>,
    )
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('uses default when localStorage has invalid value', () => {
    localStorage.setItem('theme', 'invalid')
    let captured: ReturnType<typeof useTheme> | null = null
    render(
      <ThemeProvider>
        <ThemeConsumer onRender={v => (captured = v)} />
      </ThemeProvider>,
    )
    expect(captured!.theme).toBe('dark')
  })
})
