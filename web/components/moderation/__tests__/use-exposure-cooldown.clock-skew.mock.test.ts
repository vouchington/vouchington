import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetExposureState, mockRecordMediaReveal, mockOnError } = vi.hoisted(() => ({
  mockGetExposureState: vi.fn<VitestLooseMock>(),
  mockRecordMediaReveal: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/moderation-exposure'), () => ({
  getExposureState: mockGetExposureState,
  recordMediaReveal: mockRecordMediaReveal,
}))

vi.mock(import('@/lib/on-error'), () => ({ default: mockOnError }))

import { useExposureCooldown } from '../use-exposure-cooldown'

const neutralExposure = { count: 0, threshold: 10, in_cooldown: false, cooldown_ends_at: null }
const serverCooldown = {
  count: 10,
  threshold: 10,
  in_cooldown: true,
  cooldown_ends_at: '2026-01-01T00:01:00Z',
}

describe('useExposureCooldown clock skew', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:05:00Z'))
    mockGetExposureState.mockReset()
    mockRecordMediaReveal.mockReset()
    mockOnError.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reconfirms after a minimum delay when the server still reports cooldown', async () => {
    mockGetExposureState
      .mockResolvedValueOnce({ exposure: serverCooldown })
      .mockResolvedValueOnce({ exposure: serverCooldown })
      .mockResolvedValueOnce({ exposure: neutralExposure })

    const { result } = renderHook(() => useExposureCooldown())
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockGetExposureState).toHaveBeenCalledTimes(2)
    expect(result.current.revealBlocked).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(999)
    })
    expect(mockGetExposureState).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(mockGetExposureState).toHaveBeenCalledTimes(3)
    expect(result.current.exposureState).toEqual(neutralExposure)
    expect(result.current.revealBlocked).toBe(false)
  })

  it('cancels re-confirmation when the hook unmounts', async () => {
    mockGetExposureState.mockResolvedValue({ exposure: serverCooldown })

    const { unmount } = renderHook(() => useExposureCooldown())
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockGetExposureState).toHaveBeenCalledTimes(2)

    unmount()
    await vi.advanceTimersByTimeAsync(1000)

    expect(mockGetExposureState).toHaveBeenCalledTimes(2)
  })

  it('waits a full minimum delay after a slow confirmation settles', async () => {
    const confirmation = Promise.withResolvers<{ exposure: typeof serverCooldown }>()
    mockGetExposureState
      .mockResolvedValueOnce({ exposure: serverCooldown })
      .mockReturnValueOnce(confirmation.promise)
      .mockResolvedValueOnce({ exposure: neutralExposure })

    renderHook(() => useExposureCooldown())
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockGetExposureState).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(999)
    await act(async () => {
      confirmation.resolve({ exposure: serverCooldown })
      await confirmation.promise
    })

    await vi.advanceTimersByTimeAsync(1)
    expect(mockGetExposureState).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(999)
    expect(mockGetExposureState).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1)
    expect(mockGetExposureState).toHaveBeenCalledTimes(3)
  })
})
