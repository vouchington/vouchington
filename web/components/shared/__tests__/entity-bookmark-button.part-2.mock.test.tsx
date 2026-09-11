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

  it('applies subscribe preset defaults', async () => {
    mockBookmarkEntity.mockResolvedValue(undefined)

    render(
      <EntityBookmarkButton
        entityType='post'
        entityId='post-1'
        preset='subscribe'
        initialActive={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }))

    await waitFor(() => {
      expect(mockBookmarkEntity).toHaveBeenCalledWith('post', 'post-1', 'subscribe')
    })
  })

  it('renders tooltip text when tooltip is provided', () => {
    render(
      <EntityBookmarkButton
        entityType='user'
        entityId='user-1'
        preset='block'
        initialActive={false}
        tooltip='Block this user from interacting with you'
      />,
    )

    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Block this user from interacting with you',
    )
  })

  it('does not render tooltip text when tooltip is absent', () => {
    render(
      <EntityBookmarkButton
        entityType='topic'
        entityId='topic-1'
        preset='mute'
        initialActive={false}
      />,
    )

    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('uses an aria-disabled button for the loading tooltip trigger', async () => {
    let resolveBookmarks: ((value: { bookmarks: Record<string, boolean> }) => void) | undefined

    mockGetEntityBookmarks.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveBookmarks = resolve
        }),
    )

    render(
      <EntityBookmarkButton
        entityType='topic'
        entityId='topic-1'
        predicate='subscribe_posts'
        inactiveLabel='Subscribe to Posts'
        activeLabel='Subscribed to Posts'
        loadingTooltip='Loading subscriptions'
      />,
    )

    const button = screen.getByRole('button', { name: 'Subscribe to Posts' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Loading subscriptions')

    fireEvent.click(button)
    expect(mockBookmarkEntity).not.toHaveBeenCalled()

    resolveBookmarks?.({ bookmarks: { subscribe_posts: false } })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Subscribe to Posts' })).not.toHaveAttribute(
        'aria-disabled',
      )
    })
  })

  it('refetches bookmark state when a sibling emits a bookmark change for the same predicate', async () => {
    // Start inactive; after the sibling emit the server returns active
    mockGetEntityBookmarks.mockResolvedValue({ bookmarks: { proxy_follow: true } })

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

    expect(screen.getByRole('button', { name: 'Follow' })).toBeDefined()

    // Simulate a sibling proxy_follow button toggling — same predicate triggers refetch
    await act(async () => {
      emitBookmarkChange('community', 'community-1', 'proxy_follow', 'sibling-instance-id')
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Following' })).toBeDefined()
    })
    expect(mockGetEntityBookmarks).toHaveBeenCalledWith('community', 'community-1')
  })

  it('does not refetch when a sibling emits a bookmark change for a different predicate', async () => {
    mockGetEntityBookmarks.mockResolvedValue({ bookmarks: { proxy_follow: false } })

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

    // Simulate a sibling proxy_mute button toggling — different predicate must not trigger refetch
    await act(async () => {
      emitBookmarkChange('community', 'community-1', 'proxy_mute', 'sibling-instance-id')
    })

    expect(mockGetEntityBookmarks).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Follow' })).toBeDefined()
  })

  it('does not refetch when own instance emits a bookmark change', async () => {
    mockBookmarkEntity.mockResolvedValue(undefined)

    render(
      <EntityBookmarkButton
        entityType='topic'
        entityId='topic-1'
        predicate='follow'
        inactiveLabel='Follow'
        activeLabel='Following'
        initialActive={false}
      />,
    )

    // Click the button — handleToggle emits with the component's own instanceId
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }))
    await waitFor(() => {
      expect(mockBookmarkEntity).toHaveBeenCalledWith('topic', 'topic-1', 'follow')
    })

    // The emit from the component's own click should NOT trigger a getEntityBookmarks refetch
    expect(mockGetEntityBookmarks).not.toHaveBeenCalled()
  })
})
