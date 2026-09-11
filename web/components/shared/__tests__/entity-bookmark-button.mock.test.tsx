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

vi.mock(
  import('../entity-action-icons'),
  () =>
    ({
      EntityActionIcons: {
        proxyFollow: () => <svg data-testid='proxy-follow-icon' />,
      },
    }) as unknown as typeof import('../entity-action-icons'),
)

const {
  mockBookmarkEntity,
  mockUnbookmarkEntity,
  mockGetEntityBookmarks,
  mockToastError,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockBookmarkEntity: vi.fn<VitestLooseMock>(),
  mockUnbookmarkEntity: vi.fn<VitestLooseMock>(),
  mockGetEntityBookmarks: vi.fn<VitestLooseMock>(),
  mockToastError: vi.fn<VitestLooseMock>(),
  mockToastSuccess: vi.fn<VitestLooseMock>(),
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

describe('EntityBookmarkButton', () => {
  beforeEach(() => {
    mockBookmarkEntity.mockReset()
    mockUnbookmarkEntity.mockReset()
    mockGetEntityBookmarks.mockReset()
    mockToastError.mockReset()
  })

  it('loads initial bookmark state when not provided', async () => {
    mockGetEntityBookmarks.mockResolvedValue({ bookmarks: { subscribe_posts: true } })

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
      expect(screen.getByRole('button', { name: 'Subscribed to Posts' })).toBeDefined()
    })
    expect(mockGetEntityBookmarks).toHaveBeenCalledWith('topic', 'topic-1')
  })

  it('optimistically subscribes and unsubscribes', async () => {
    mockBookmarkEntity.mockResolvedValue(undefined)
    mockUnbookmarkEntity.mockResolvedValue(undefined)

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

    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }))

    await waitFor(() => {
      expect(mockBookmarkEntity).toHaveBeenCalledWith('post', 'post-1', 'subscribe')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Subscribed' }))

    await waitFor(() => {
      expect(mockUnbookmarkEntity).toHaveBeenCalledWith('post', 'post-1', 'subscribe')
    })
  })

  it('renders an optional semantic icon before the label', () => {
    render(
      <EntityBookmarkButton
        entityType='community'
        entityId='community-1'
        predicate='proxy_follow'
        inactiveLabel='Virtually Follow'
        activeLabel='Virtually Following'
        iconKey='proxyFollow'
        initialActive={false}
      />,
    )

    expect(screen.getByRole('button', { name: 'Virtually Follow' })).toContainElement(
      screen.getByTestId('proxy-follow-icon'),
    )
  })

  it('reconciles optimistic state when server props change', async () => {
    mockBookmarkEntity.mockResolvedValue(undefined)

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

    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Subscribed' })).toBeDefined()
    })

    rerender(
      <EntityBookmarkButton
        entityType='post'
        entityId='post-1'
        predicate='subscribe'
        inactiveLabel='Subscribe'
        activeLabel='Subscribed'
        initialActive
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Subscribed' })).toBeDefined()
    })

    rerender(
      <EntityBookmarkButton
        entityType='post'
        entityId='post-1'
        predicate='subscribe'
        inactiveLabel='Subscribe'
        activeLabel='Subscribed'
        initialActive={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Subscribe' })).toBeDefined()
    })
  })

  it('resets display state immediately when the entity changes', async () => {
    mockGetEntityBookmarks.mockReturnValue(
      new Promise(() => {
        // Keep the new entity in loading state so stale state would stay visible.
      }),
    )

    const { rerender } = render(
      <EntityBookmarkButton
        entityType='post'
        entityId='post-1'
        predicate='subscribe'
        inactiveLabel='Subscribe'
        activeLabel='Subscribed'
        initialActive
      />,
    )

    expect(screen.getByRole('button', { name: 'Subscribed' })).toBeDefined()

    rerender(
      <EntityBookmarkButton
        entityType='post'
        entityId='post-2'
        predicate='subscribe'
        inactiveLabel='Subscribe'
        activeLabel='Subscribed'
      />,
    )

    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeDisabled()
  })

  it('ignores failed toggle rollbacks after the entity changes', async () => {
    let rejectBookmark: ((reason?: unknown) => void) | undefined
    mockBookmarkEntity.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Subscribed' })).toBeDefined()
    })

    rerender(
      <EntityBookmarkButton
        entityType='post'
        entityId='post-2'
        predicate='subscribe'
        inactiveLabel='Subscribe'
        activeLabel='Subscribed'
        initialActive={false}
      />,
    )

    await act(async () => {
      rejectBookmark?.(new Error('request failed'))
    })

    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeDefined()
  })
})
