import { act, renderHook } from '@testing-library/react'
import { ApiError } from '@vouchington/api-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readResendAfterSeconds, useResendCooldown } from './use-resend-cooldown'

describe('readResendAfterSeconds', () => {
  it('reads a positive interval and ignores anything else', () => {
    expect(readResendAfterSeconds({ resend_after_seconds: 59.2 })).toBe(60)
    expect(readResendAfterSeconds({ resend_after_seconds: 0 })).toBe(0)
    expect(readResendAfterSeconds({ resend_after_seconds: '60' })).toBe(0)
    expect(readResendAfterSeconds({})).toBe(0)
    expect(readResendAfterSeconds(undefined)).toBe(0)
  })
})

describe('useResendCooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts down the server interval to zero', () => {
    const { result } = renderHook(() => useResendCooldown())
    act(() => result.current.startFromResponse({ resend_after_seconds: 3 }))
    expect(result.current.secondsLeft).toBe(3)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.secondsLeft).toBe(2)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.secondsLeft).toBe(1)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.secondsLeft).toBe(0)
  })

  it('starts from retry_after on a 429 and ignores other errors', () => {
    const { result } = renderHook(() => useResendCooldown())
    act(() => result.current.startFromError(new ApiError('Bad', 500, { retry_after: 9 })))
    expect(result.current.secondsLeft).toBe(0)
    act(() =>
      result.current.startFromError(new ApiError('Too Many Requests', 429, { retry_after: 9 })),
    )
    expect(result.current.secondsLeft).toBe(9)
  })
})
