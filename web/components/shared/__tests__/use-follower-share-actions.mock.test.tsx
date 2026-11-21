import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicUser } from '@/types/user'

const { mockOnError, mockUseContentLimits } = vi.hoisted(() => ({
  mockOnError: vi.fn<VitestLooseMock>(),
  mockUseContentLimits: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), async importOriginal => ({
  ...(await importOriginal()),
  default: mockOnError,
}))
vi.mock(import('@/hooks/use-content-limits'), () => ({
  useContentLimits: mockUseContentLimits,
}))

import { useFollowerShareActions } from '../use-follower-share-actions'

const follower = (id: string) => ({ id, username: id }) as PublicUser

describe('useFollowerShareActions follower selection cap', () => {
  beforeEach(() => {
    mockOnError.mockReset()
    mockUseContentLimits.mockReturnValue({ follower_distribution_recipients_max: 1 })
  })

  it('reports the configured cap and keeps the selection when it is exceeded', () => {
    const { result } = renderHook(() =>
      useFollowerShareActions({ entityType: 'post', entityId: 'post-1', currentUserId: 'me' }),
    )

    act(() => result.current.toggleFollowerSelection(follower('a')))
    act(() => result.current.toggleFollowerSelection(follower('b')))

    expect(result.current.selectedFollowers.map(({ id }) => id)).toEqual(['a'])
    expect(mockOnError).toHaveBeenCalledOnce()
    expect(String(mockOnError.mock.calls[0]![0])).toContain('1')
  })
})
