import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockCheckAvailability } = vi.hoisted(() => ({
  mockCheckAvailability: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/availability'), () => ({
  checkAvailability: mockCheckAvailability,
}))

import { useAvailabilityCheck } from './use-availability-check'

describe('useAvailabilityCheck', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('starts idle and stays idle for an empty value', () => {
    const { result } = renderHook(() => useAvailabilityCheck('topic-slug'))
    expect(result.current.state).toEqual({ status: 'idle', conflict: null })

    act(() => result.current.onBlur('   '))
    expect(result.current.state.status).toBe('idle')
    expect(mockCheckAvailability).not.toHaveBeenCalled()
  })

  it('sets status to available when the value is free', async () => {
    mockCheckAvailability.mockResolvedValue({ available: true, conflict: null })
    const { result } = renderHook(() => useAvailabilityCheck('topic-slug'))

    act(() => result.current.onBlur('my-slug'))

    await waitFor(() => expect(result.current.state.status).toBe('available'))
    expect(result.current.state.conflict).toBeNull()
    expect(mockCheckAvailability).toHaveBeenCalledWith('topic-slug', 'my-slug', expect.any(Object))
  })

  it('sets status to taken with the conflict when the value is used', async () => {
    const conflict = { kind: 'topic', id: 't1', slug: 's', name: 'n', topic_type: 'topic' }
    mockCheckAvailability.mockResolvedValue({ available: false, conflict })
    const { result } = renderHook(() => useAvailabilityCheck('topic-slug'))

    act(() => result.current.onBlur('taken-slug'))

    await waitFor(() => expect(result.current.state.status).toBe('taken'))
    expect(result.current.state.conflict).toEqual(conflict)
  })

  it('sets status to error on a non-abort rejection', async () => {
    mockCheckAvailability.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useAvailabilityCheck('username'))

    act(() => result.current.onBlur('bob'))

    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.state.conflict).toBeNull()
  })

  it('ignores AbortError rejections (no state change)', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' })
    mockCheckAvailability.mockRejectedValue(abortErr)
    const { result } = renderHook(() => useAvailabilityCheck('username'))

    act(() => result.current.onBlur('bob'))

    await waitFor(() => expect(mockCheckAvailability).toHaveBeenCalled())
    // It transitions to 'checking' and never moves to 'error' for an abort.
    await waitFor(() => expect(result.current.state.status).toBe('checking'))
  })

  it('reset() returns to idle and aborts in-flight checks', async () => {
    let resolveCheck!: (value: { available: boolean; conflict: null }) => void
    mockCheckAvailability.mockReturnValue(
      new Promise(resolve => {
        resolveCheck = resolve
      }),
    )
    const { result } = renderHook(() => useAvailabilityCheck('topic-slug'))

    act(() => result.current.onBlur('pending-slug'))
    await waitFor(() => expect(result.current.state.status).toBe('checking'))

    act(() => result.current.reset())
    expect(result.current.state).toEqual({ status: 'idle', conflict: null })

    // Resolving the aborted request must not change state back to available.
    await act(async () => {
      resolveCheck({ available: true, conflict: null })
    })
    expect(result.current.state.status).toBe('idle')
  })

  it('a second onBlur aborts the first so its result is dropped', async () => {
    let resolveFirst!: (value: { available: boolean; conflict: null }) => void
    mockCheckAvailability
      .mockReturnValueOnce(
        new Promise(resolve => {
          resolveFirst = resolve
        }),
      )
      .mockResolvedValueOnce({ available: false, conflict: null })

    const { result } = renderHook(() => useAvailabilityCheck('topic-slug'))

    act(() => result.current.onBlur('first-slug'))
    act(() => result.current.onBlur('second-slug'))

    await waitFor(() => expect(result.current.state.status).toBe('taken'))

    // The first (aborted) request resolving must not overwrite the second result.
    await act(async () => {
      resolveFirst({ available: true, conflict: null })
    })
    expect(result.current.state.status).toBe('taken')
  })
})
