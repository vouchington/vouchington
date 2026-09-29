import {
  mockBookmarkEntity,
  mockGetEntityBookmarks,
  resetEntityBookmarkEdgeDoubles,
} from '@/test-helpers/components/shared/entity-bookmark-button-edge.mock-support'

import { emitBookmarkChange } from '@/hooks/use-bookmark-invalidation'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { EntityBookmarkButton } from '../entity-bookmark-button'

describe('EntityBookmarkButton Edge Cases', () => {
  beforeEach(() => {
    resetEntityBookmarkEdgeDoubles()
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
