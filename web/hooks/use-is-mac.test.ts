import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useIsMac } from './use-is-mac'

describe('useIsMac', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    { device: 'Mac', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', expected: true },
    {
      device: 'iPhone',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      expected: true,
    },
    { device: 'iPad', userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)', expected: true },
    {
      device: 'iPod',
      userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 14_0 like Mac OS X)',
      expected: true,
    },
    { device: 'Windows', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', expected: false },
    { device: 'Linux', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', expected: false },
    { device: 'Android', userAgent: 'Mozilla/5.0 (Linux; Android 11; SM-G991B)', expected: false },
  ])('returns $expected for $device user agents', ({ userAgent, expected }) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
    const { result } = renderHook(() => useIsMac())
    expect(result.current).toBe(expected)
  })
})
