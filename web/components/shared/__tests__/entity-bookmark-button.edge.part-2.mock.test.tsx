import { act, fireEvent, render, screen } from '@testing-library/react'

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

  it('ignores initial state load failure when unmounted before fetch completes', async () => {
    let rejectBookmarks!: (reason: Error) => void
    mockGetEntityBookmarks.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectBookmarks = reject
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
      rejectBookmarks(new Error('load failed'))
    })

    expect(mockGetEntityBookmarks).toHaveBeenCalledWith('topic', 'topic-1')
  })

  it('handles failed refetch cleanly when sibling emits a bookmark change', async () => {
    mockGetEntityBookmarks.mockRejectedValue(new Error('refetch failed'))

    render(
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

    expect(mockGetEntityBookmarks).toHaveBeenCalledTimes(1)
  })

  it('handles state key mismatch gracefully when props change during in-flight operations', async () => {
    let rejectBookmark!: (reason: Error) => void
    mockBookmarkEntity.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectBookmark = reject
        }),
    )

    const { rerender } = render(
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

    rerender(
      <EntityBookmarkButton
        entityType='post'
        entityId='post-2'
        predicate='subscribe'
        inactiveLabel='Subscribe'
        activeLabel='Subscribed'
        initialActive
      />,
    )

    await act(async () => {
      rejectBookmark(new Error('fail'))
    })

    expect(mockBookmarkEntity).toHaveBeenCalledWith('post', 'post-1', 'subscribe')
    expect(screen.getByRole('button', { name: 'Subscribed' })).toBeInTheDocument()
  })

  it('handles sibling state key mismatch gracefully when props change during in-flight sibling change', async () => {
    let resolveBookmarks!: (value: { bookmarks: Record<string, boolean> }) => void
    mockGetEntityBookmarks.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveBookmarks = resolve
        }),
    )

    const { rerender } = render(
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

    rerender(
      <EntityBookmarkButton
        entityType='community'
        entityId='community-2'
        predicate='proxy_follow'
        inactiveLabel='Follow'
        activeLabel='Following'
        initialActive={false}
      />,
    )

    await act(async () => {
      resolveBookmarks({ bookmarks: { proxy_follow: true } })
    })

    expect(mockGetEntityBookmarks).toHaveBeenCalledWith('community', 'community-1')
    expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument()
  })
})
