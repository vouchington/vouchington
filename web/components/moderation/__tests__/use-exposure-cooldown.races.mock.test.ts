import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetExposureState, mockRecordMediaReveal } = vi.hoisted(() => ({
  mockGetExposureState: vi.fn<VitestLooseMock>(),
  mockRecordMediaReveal: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/moderation-exposure'), () => ({
  getExposureState: mockGetExposureState,
  recordMediaReveal: mockRecordMediaReveal,
}))

vi.mock(import('@/lib/on-error'), () => ({ default: vi.fn<VitestLooseMock>() }))

import { useExposureCooldown } from '../use-exposure-cooldown'

const neutralExposure = { count: 0, threshold: 10, in_cooldown: false, cooldown_ends_at: null }
const cooldownExposure = {
  count: 10,
  threshold: 10,
  in_cooldown: true,
  cooldown_ends_at: '2099-01-01T00:00:00Z',
}

describe('useExposureCooldown reveal races', () => {
  beforeEach(() => {
    mockGetExposureState.mockReset()
    mockRecordMediaReveal.mockReset()
  })

  it('does not let a refresh started during a reveal overwrite its cooldown', async () => {
    let resolveReveal: ((value: { exposure: typeof cooldownExposure }) => void) | undefined
    let resolveRefresh: ((value: { exposure: typeof neutralExposure }) => void) | undefined
    const reveal = new Promise<{ exposure: typeof cooldownExposure }>(resolve => {
      resolveReveal = resolve
    })
    const refresh = new Promise<{ exposure: typeof neutralExposure }>(resolve => {
      resolveRefresh = resolve
    })
    mockGetExposureState
      .mockResolvedValueOnce({ exposure: neutralExposure })
      .mockReturnValueOnce(refresh)
    mockRecordMediaReveal.mockReturnValueOnce(reveal)

    const { result } = renderHook(() => useExposureCooldown())
    await waitFor(() => expect(result.current.revealBlocked).toBe(false))

    act(() => result.current.recordReveal({ postId: 'post-1', surface: 'review_queue' }))
    let refreshing!: Promise<void>
    act(() => {
      refreshing = result.current.refreshExposureState()
    })
    await act(async () => {
      resolveReveal?.({ exposure: cooldownExposure })
      await reveal
    })
    await act(async () => {
      resolveRefresh?.({ exposure: neutralExposure })
      await refreshing
    })

    expect(result.current.exposureState).toEqual(cooldownExposure)
    expect(result.current.showBreakPrompt).toBe(true)
    expect(result.current.revealBlocked).toBe(true)
  })
})
