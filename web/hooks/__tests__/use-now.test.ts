import { act, renderHook } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNow } from '../use-now'
import React from 'react'

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null on the server side', () => {
    const TestComponent = () => {
      const now = useNow()
      return React.createElement('div', null, now === null ? 'server' : 'client')
    }
    const html = renderToString(React.createElement(TestComponent))
    expect(html).toContain('server')
  })

  it('shares the same timer for multiple instances', () => {
    const mockTime = 1_000_000_000_000
    vi.setSystemTime(mockTime)

    const hook1 = renderHook(() => useNow())
    const hook2 = renderHook(() => useNow())

    expect(vi.getTimerCount()).toBe(1)
    expect(hook1.result.current).toBe(mockTime)
    expect(hook2.result.current).toBe(mockTime)

    act(() => {
      vi.advanceTimersByTime(30_000)
    })

    expect(hook1.result.current).toBe(mockTime + 30_000)
    expect(hook2.result.current).toBe(mockTime + 30_000)
  })

  it('clears interval when no subscribers', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

    const hook = renderHook(() => useNow())

    hook.unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })
})
