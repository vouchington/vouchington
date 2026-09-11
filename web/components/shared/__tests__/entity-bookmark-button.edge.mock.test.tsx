import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { ReactNode } from 'react'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EntityBookmarkButton } from '../entity-bookmark-button'

import { emitBookmarkChange } from '@/hooks/use-bookmark-invalidation'

vi.mock(
  import('@/components/ui/tooltip'),
  () =>
    ({
      Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      TooltipContent: ({ children }: { children: ReactNode }) => (
        <span role='tooltip'>{children}</span>
      ),
      TooltipProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      TooltipTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => (
        <div>{children}</div>
      ),
    }) as unknown as typeof import('@/components/ui/tooltip'),
)

const {
  mockBookmarkEntity,
  mockUnbookmarkEntity,
  mockGetEntityBookmarks,
  mockToastError,
  mockToastSuccess,
  mockIsRateLimitError,
  mockGetRateLimitMessage,
} = vi.hoisted(() => ({
  mockBookmarkEntity: vi.fn<VitestLooseMock>(),
  mockUnbookmarkEntity: vi.fn<VitestLooseMock>(),
  mockGetEntityBookmarks: vi.fn<VitestLooseMock>(),
  mockToastError: vi.fn<VitestLooseMock>(),
  mockToastSuccess: vi.fn<VitestLooseMock>(),
  mockIsRateLimitError: vi.fn<VitestLooseMock>().mockReturnValue(false),
  mockGetRateLimitMessage: vi.fn<VitestLooseMock>().mockReturnValue('Rate limited'),
}))

vi.mock(import('@/lib/api/client/bookmarks'), () => ({
  bookmarkEntity: mockBookmarkEntity,
  unbookmarkEntity: mockUnbookmarkEntity,
  getEntityBookmarks: mockGetEntityBookmarks,
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: {
        error: mockToastError,
        success: mockToastSuccess,
      },
    }) as unknown as typeof import('sonner'),
)

vi.mock(
  import('@/lib/api/rate-limit-error'),
  () =>
    ({
      isRateLimitError: mockIsRateLimitError,
      getRateLimitMessage: mockGetRateLimitMessage,
    }) as unknown as typeof import('@/lib/api/rate-limit-error'),
)

describe('EntityBookmarkButton Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBookmarkEntity.mockReset()
    mockUnbookmarkEntity.mockReset()
    mockGetEntityBookmarks.mockReset()
    mockToastError.mockReset()
    mockIsRateLimitError.mockReset().mockReturnValue(false)
    mockGetRateLimitMessage.mockReset().mockReturnValue('Rate limited')
  })

  it('throws an error when predicate or labels are missing and no preset is provided', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => {
      render(
        <EntityBookmarkButton
          entityType='topic'
          entityId='topic-1'
        />,
      )
    }).toThrow('EntityBookmarkButton requires a preset or predicate and labels.')
    consoleSpy.mockRestore()
  })

  it('handles failed initial bookmark state load cleanly', async () => {
    mockGetEntityBookmarks.mockRejectedValue(new Error('load failed'))

    render(
      <EntityBookmarkButton
        entityType='topic'
        entityId='topic-1'
        predicate='subscribe_posts'
        inactiveLabel='Subscribe to Posts'
        activeLabel='Subscribed to Posts'
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Subscribe to Posts' })).not.toHaveAttribute(
        'aria-disabled',
      )
    })
    expect(mockGetEntityBookmarks).toHaveBeenCalledWith('topic', 'topic-1')
  })

  it('rolls back the optimistic state and shows standard toast when bookmark toggle fails', async () => {
    mockBookmarkEntity.mockRejectedValue(new Error('fail'))

    render(
      <EntityBookmarkButton
        entityType='post'
        entityId='post-1'
        predicate='subscribe'
        inactiveLabel='Subscribe'
        activeLabel='Subscribed'
        initialActive={false}
      />,
    )

    const button = screen.getByRole('button', { name: 'Subscribe' })
    fireEvent.click(button)

    await waitFor(() => {
      expect(mockBookmarkEntity).toHaveBeenCalledWith('post', 'post-1', 'subscribe')
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Subscribe' })).toBeDefined()
    })
    expect(mockToastError).toHaveBeenCalledWith('Failed to update bookmark. Please try again.')
  })

  it('rolls back state and shows rate limit toast when bookmark toggle fails with a rate limit error', async () => {
    mockBookmarkEntity.mockRejectedValue(new Error('rate limit'))
    mockIsRateLimitError.mockReturnValue(true)
    mockGetRateLimitMessage.mockReturnValue('Custom rate limit message')

    render(
      <EntityBookmarkButton
        entityType='post'
        entityId='post-1'
        predicate='subscribe'
        inactiveLabel='Subscribe'
        activeLabel='Subscribed'
        initialActive={false}
      />,
    )

    const button = screen.getByRole('button', { name: 'Subscribe' })
    fireEvent.click(button)

    await waitFor(() => {
      expect(mockBookmarkEntity).toHaveBeenCalledWith('post', 'post-1', 'subscribe')
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Subscribe' })).toBeDefined()
    })
    expect(mockToastError).toHaveBeenCalledWith('Custom rate limit message')
  })

  it('ignores initial state load when unmounted before fetch completes', async () => {
    let resolveBookmarks!: (value: { bookmarks: Record<string, boolean> }) => void
    mockGetEntityBookmarks.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveBookmarks = resolve
        }),
    )

    const { unmount } = render(
      <EntityBookmarkButton
        entityType='topic'
        entityId='topic-1'
        predicate='subscribe_posts'
        inactiveLabel='Subscribe to Posts'
        activeLabel='Subscribed to Posts'
      />,
    )

    unmount()

    await act(async () => {
      resolveBookmarks({ bookmarks: { subscribe_posts: true } })
    })

    expect(mockGetEntityBookmarks).toHaveBeenCalledWith('topic', 'topic-1')
  })

  it('ignores sibling change fetch when unmounted before fetch completes', async () => {
    let resolveBookmarks!: (value: { bookmarks: Record<string, boolean> }) => void
    let getBookmarksCallCount = 0

    mockGetEntityBookmarks.mockImplementation(() => {
      getBookmarksCallCount++
      return new Promise(resolve => {
        resolveBookmarks = resolve
      })
    })

    const { unmount } = render(
      <EntityBookmarkButton
        entityType='community'
        entityId='community-1'
        predicate='proxy_follow'
        inactiveLabel='Follow'
        activeLabel='Following'
        initialActive={false}
      />,
    )

    await act(async () => {
      emitBookmarkChange('community', 'community-1', 'proxy_follow', 'sibling-instance-id')
    })

    expect(getBookmarksCallCount).toBe(1)

    unmount()

    await act(async () => {
      resolveBookmarks({ bookmarks: { proxy_follow: true } })
    })

    expect(mockGetEntityBookmarks).toHaveBeenCalledWith('community', 'community-1')
  })
})
