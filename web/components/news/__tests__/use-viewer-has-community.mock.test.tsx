import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useViewerHasCommunity, resetViewerHasCommunityCache } from '../use-viewer-has-community'

const { mockLoadMyCommunities } = vi.hoisted(() => ({
  mockLoadMyCommunities: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/communities'), () => ({
  loadMyCommunities: mockLoadMyCommunities,
}))

describe('useViewerHasCommunity', () => {
  beforeEach(() => {
    resetViewerHasCommunityCache()
    mockLoadMyCommunities.mockReset()
  })

  it('returns false initially', () => {
    mockLoadMyCommunities.mockResolvedValue([])
    const { result } = renderHook(() => useViewerHasCommunity(true))
    expect(result.current).toBe(false)
  })

  it('returns false when not enabled', async () => {
    mockLoadMyCommunities.mockResolvedValue([{ id: 'c1' }])
    const { result } = renderHook(() => useViewerHasCommunity(false))
    expect(result.current).toBe(false)
    expect(mockLoadMyCommunities).not.toHaveBeenCalled()
  })

  it('returns true when communities list has items', async () => {
    mockLoadMyCommunities.mockResolvedValue([{ id: 'c1' }])
    const { result } = renderHook(() => useViewerHasCommunity(true))
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current).toBe(true)
  })

  it('returns false when communities list is empty', async () => {
    mockLoadMyCommunities.mockResolvedValue([])
    const { result } = renderHook(() => useViewerHasCommunity(true))
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current).toBe(false)
  })

  it('caches the promise: loadMyCommunities called once for two hook instances', async () => {
    mockLoadMyCommunities.mockResolvedValue([{ id: 'c1' }])
    const { result: r1 } = renderHook(() => useViewerHasCommunity(true))
    const { result: r2 } = renderHook(() => useViewerHasCommunity(true))
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockLoadMyCommunities).toHaveBeenCalledTimes(1)
    expect(r1.current).toBe(true)
    expect(r2.current).toBe(true)
  })

  it('resets cache with resetViewerHasCommunityCache', async () => {
    mockLoadMyCommunities.mockResolvedValue([])
    renderHook(() => useViewerHasCommunity(true))
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockLoadMyCommunities).toHaveBeenCalledTimes(1)
    resetViewerHasCommunityCache()
    renderHook(() => useViewerHasCommunity(true))
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockLoadMyCommunities).toHaveBeenCalledTimes(2)
  })
})
