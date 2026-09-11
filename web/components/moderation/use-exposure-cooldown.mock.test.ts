import { act, renderHook, waitFor } from '@testing-library/react'
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

import { useExposureCooldown } from './use-exposure-cooldown'

const neutralExposure = { count: 0, threshold: 10, in_cooldown: false, cooldown_ends_at: null }
const cooldownExposure = {
  count: 10,
  threshold: 10,
  in_cooldown: true,
  cooldown_ends_at: '2099-01-01T00:00:00Z',
}

describe('useExposureCooldown', () => {
  beforeEach(() => {
    mockGetExposureState.mockReset()
    mockRecordMediaReveal.mockReset()
    mockOnError.mockReset()
    mockGetExposureState.mockResolvedValue({ exposure: neutralExposure })
    mockRecordMediaReveal.mockResolvedValue({ exposure: neutralExposure })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('recordReveal calls API and updates exposure state', async () => {
    const revealedExposure = { ...neutralExposure, count: 3 }
    mockRecordMediaReveal.mockResolvedValueOnce({ exposure: revealedExposure })

    const { result } = renderHook(() => useExposureCooldown())
    await waitFor(() => expect(result.current.revealBlocked).toBe(false))

    act(() => {
      result.current.recordReveal({ surface: 'mod_queue' })
    })

    await waitFor(() => {
      expect(result.current.exposureState).toEqual(revealedExposure)
    })
    expect(mockRecordMediaReveal).toHaveBeenCalledWith({ surface: 'mod_queue' })
  })

  it('recordReveal sets showBreakPrompt when response is in cooldown', async () => {
    mockRecordMediaReveal.mockResolvedValueOnce({ exposure: cooldownExposure })

    const { result } = renderHook(() => useExposureCooldown())
    await waitFor(() => expect(result.current.revealBlocked).toBe(false))

    act(() => {
      result.current.recordReveal({ surface: 'review_queue' })
    })

    await waitFor(() => {
      expect(result.current.showBreakPrompt).toBe(true)
    })
  })

  it('recordReveal calls onError when API rejects', async () => {
    const error = new Error('network error')
    mockRecordMediaReveal.mockRejectedValueOnce(error)

    const { result } = renderHook(() => useExposureCooldown())
    await waitFor(() => expect(result.current.revealBlocked).toBe(false))

    act(() => {
      result.current.recordReveal({ surface: 'mod_queue' })
    })

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(error, { fallback: 'Failed to record reveal' })
    })
  })

  it('keeps the prompt and gate active when dismissal is attempted before expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    mockGetExposureState.mockResolvedValueOnce({
      exposure: {
        ...cooldownExposure,
        cooldown_ends_at: '2026-01-01T00:01:00Z',
      },
    })

    const { result } = renderHook(() => useExposureCooldown())
    await act(async () => {
      await Promise.resolve()
    })
    act(() => result.current.dismissBreakPrompt())

    expect(result.current.showBreakPrompt).toBe(true)
    expect(result.current.exposureState?.in_cooldown).toBe(true)
  })

  it('keeps the prompt and gate active when the server expiry is invalid', async () => {
    mockGetExposureState.mockResolvedValueOnce({
      exposure: { ...cooldownExposure, cooldown_ends_at: 'invalid' },
    })

    const { result } = renderHook(() => useExposureCooldown())
    await act(async () => {
      await Promise.resolve()
    })
    act(() => result.current.dismissBreakPrompt())

    expect(result.current.showBreakPrompt).toBe(true)
    expect(result.current.exposureState?.in_cooldown).toBe(true)
  })

  it('automatically refetches once at expiry and resumes after server confirmation', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    mockGetExposureState.mockResolvedValueOnce({
      exposure: {
        ...cooldownExposure,
        cooldown_ends_at: '2026-01-01T00:01:00Z',
      },
    })
    mockGetExposureState.mockResolvedValueOnce({ exposure: neutralExposure })

    const { result } = renderHook(() => useExposureCooldown())
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
      await Promise.resolve()
    })
    expect(mockGetExposureState).toHaveBeenCalledTimes(2)
    expect(result.current.showBreakPrompt).toBe(false)
    expect(result.current.exposureState).toEqual(neutralExposure)
    expect(result.current.revealBlocked).toBe(false)
  })

  it('stays gated after scheduled failure and resumes after an explicit retry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const expiryError = new Error('expiry check failed')
    mockGetExposureState
      .mockResolvedValueOnce({
        exposure: {
          ...cooldownExposure,
          cooldown_ends_at: '2026-01-01T00:01:00Z',
        },
      })
      .mockRejectedValueOnce(expiryError)
      .mockResolvedValueOnce({ exposure: neutralExposure })

    const { result } = renderHook(() => useExposureCooldown())
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
      await Promise.resolve()
    })

    expect(mockOnError).toHaveBeenCalledWith(expiryError, {
      fallback: 'Failed to load exposure state',
    })
    expect(result.current.showBreakPrompt).toBe(true)
    expect(result.current.exposureStateIsStale).toBe(true)
    expect(result.current.revealBlocked).toBe(true)

    act(() => result.current.dismissBreakPrompt())
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockGetExposureState).toHaveBeenCalledTimes(3)
    expect(result.current.showBreakPrompt).toBe(false)
    expect(result.current.exposureStateIsStale).toBe(false)
    expect(result.current.revealBlocked).toBe(false)
  })

  it('blocks more reveals after an ambiguous failure until GET reconciliation succeeds', async () => {
    let resolveReconciliation: ((value: { exposure: typeof neutralExposure }) => void) | undefined
    const reconciliation = new Promise<{ exposure: typeof neutralExposure }>(resolve => {
      resolveReconciliation = resolve
    })
    mockGetExposureState
      .mockResolvedValueOnce({ exposure: neutralExposure })
      .mockReturnValueOnce(reconciliation)
    mockRecordMediaReveal
      .mockRejectedValueOnce(new Error('ambiguous network failure'))
      .mockResolvedValueOnce({ exposure: { ...neutralExposure, count: 1 } })

    const { result } = renderHook(() => useExposureCooldown())
    await waitFor(() => expect(result.current.revealBlocked).toBe(false))

    act(() => result.current.recordReveal({ postId: 'post-1', surface: 'review_queue' }))
    await waitFor(() => expect(result.current.exposureStateIsStale).toBe(true))
    expect(result.current.revealBlocked).toBe(true)

    act(() => result.current.recordReveal({ postId: 'post-2', surface: 'review_queue' }))
    expect(mockRecordMediaReveal).toHaveBeenCalledOnce()

    await act(async () => {
      resolveReconciliation?.({ exposure: neutralExposure })
      await reconciliation
    })
    expect(result.current.exposureStateIsStale).toBe(false)
    expect(result.current.revealBlocked).toBe(false)

    act(() => result.current.recordReveal({ postId: 'post-2', surface: 'review_queue' }))
    await waitFor(() => expect(mockRecordMediaReveal).toHaveBeenCalledTimes(2))
  })

  it('does not let an older refresh overwrite a newer reveal cooldown', async () => {
    let resolveRefresh: ((value: { exposure: typeof neutralExposure }) => void) | undefined
    const refresh = new Promise<{ exposure: typeof neutralExposure }>(resolve => {
      resolveRefresh = resolve
    })
    mockGetExposureState
      .mockResolvedValueOnce({ exposure: neutralExposure })
      .mockReturnValueOnce(refresh)
    mockRecordMediaReveal.mockResolvedValueOnce({ exposure: cooldownExposure })

    const { result } = renderHook(() => useExposureCooldown())
    await waitFor(() => expect(result.current.revealBlocked).toBe(false))

    let refreshing!: Promise<void>
    act(() => {
      refreshing = result.current.refreshExposureState()
    })
    act(() => result.current.recordReveal({ postId: 'post-1', surface: 'review_queue' }))
    await waitFor(() => expect(result.current.exposureState).toEqual(cooldownExposure))

    await act(async () => {
      resolveRefresh?.({ exposure: neutralExposure })
      await refreshing
    })

    expect(result.current.exposureState).toEqual(cooldownExposure)
    expect(result.current.showBreakPrompt).toBe(true)
    expect(result.current.revealBlocked).toBe(true)
  })

  it('does not let the mount request overwrite a newer reveal cooldown', async () => {
    let resolveMount!: (value: { exposure: typeof neutralExposure }) => void
    const mountRequest = new Promise<{ exposure: typeof neutralExposure }>(resolve => {
      resolveMount = resolve
    })
    mockGetExposureState
      .mockReturnValueOnce(mountRequest)
      .mockResolvedValueOnce({ exposure: neutralExposure })
    mockRecordMediaReveal.mockResolvedValueOnce({ exposure: cooldownExposure })

    const { result } = renderHook(() => useExposureCooldown())

    await act(async () => {
      await result.current.refreshExposureState()
    })
    expect(result.current.revealBlocked).toBe(false)

    act(() => result.current.recordReveal({ postId: 'post-1', surface: 'review_queue' }))
    await waitFor(() => expect(result.current.exposureState).toEqual(cooldownExposure))

    await act(async () => {
      resolveMount({ exposure: neutralExposure })
      await mountRequest
    })

    expect(result.current.exposureState).toEqual(cooldownExposure)
    expect(result.current.showBreakPrompt).toBe(true)
    expect(result.current.revealBlocked).toBe(true)
  })
})
