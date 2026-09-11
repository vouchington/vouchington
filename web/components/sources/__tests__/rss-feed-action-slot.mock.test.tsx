import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'

const { MockFollowButton, mockRouterRefresh } = vi.hoisted(() => ({
  MockFollowButton: ({ onChange }: { onChange?: (v: boolean) => void }) => (
    <button
      type='button'
      aria-label='follow'
      data-testid='follow-button'
      onClick={() => onChange?.(false)}
    />
  ),
  mockRouterRefresh: vi.fn<() => void>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRouterRefresh }),
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(
  import('next/dynamic'),
  () => ({ default: (_: unknown) => MockFollowButton }) as unknown as typeof import('next/dynamic'),
)

vi.mock(import('@/components/users/relation-management-action'), () => ({
  RelationManagementAction: () => <div data-testid='relation-management-action' />,
}))

import { type RssFeedListItemAction, RssFeedActionSlot } from '../rss-feed-action-slot'
import type { ViewRssFeed } from '@/types/rss-feeds'

type FeedProp = ViewRssFeed

describe('RssFeedActionSlot', () => {
  beforeEach(() => {
    mockRouterRefresh.mockClear()
  })

  it('renders FollowButton when action kind is follow', () => {
    const feed = { id: 'f1', topic: { id: 'topic-1' } } as FeedProp
    const action: RssFeedListItemAction = { kind: 'follow' }

    render(
      <RssFeedActionSlot
        feed={feed}
        action={action}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    expect(screen.getAllByTestId('follow-button')).toHaveLength(2)
    expect(screen.queryByTestId('relation-management-action')).toBeNull()
  })

  it('calls router.refresh when source follow button fires onChange(false) and refreshOnUnfollow is true', () => {
    const feed = { id: 'f1', topic: { id: 'topic-1' } } as FeedProp
    const action: RssFeedListItemAction = { kind: 'follow' }

    render(
      <RssFeedActionSlot
        feed={feed}
        action={action}
        isFollowing
        isFollowingTopic={false}
        refreshOnUnfollow
      />,
    )

    // Click the first follow-button (source), which fires onChange(false)
    const sourceBtn = screen.getAllByTestId('follow-button')[0]!
    sourceBtn.click()
    expect(mockRouterRefresh).toHaveBeenCalledOnce()
  })

  it('does not call router.refresh when refreshOnUnfollow is false', () => {
    const feed = { id: 'f1', topic: { id: 'topic-1' } } as FeedProp
    const action: RssFeedListItemAction = { kind: 'follow' }

    render(
      <RssFeedActionSlot
        feed={feed}
        action={action}
        isFollowing
        isFollowingTopic={false}
      />,
    )

    const sourceBtn = screen.getAllByTestId('follow-button')[0]!
    sourceBtn.click()
    expect(mockRouterRefresh).not.toHaveBeenCalled()
  })

  it('renders RelationManagementAction when action kind is relation', () => {
    const feed = { id: 'f1' } as FeedProp
    const action: RssFeedListItemAction = {
      kind: 'relation',
      config: {
        entityType: 'rss_feed',
        predicate: 'subscribe',
        activeLabel: 'extracted.userProfileCollections.usersRssFeeds.subscribed_25c4797c',
        inactiveLabel: 'extracted.userProfileCollections.usersRssFeeds.subscribe_cc0e38da',
        errorLabel: 'extracted.userProfileCollections.usersRssFeeds.rssFeedSubscription_a01f62b2',
      },
    }

    render(
      <RssFeedActionSlot
        feed={feed}
        action={action}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    expect(screen.getByTestId('relation-management-action')).toBeDefined()
    expect(screen.queryByTestId('follow-button')).toBeNull()
  })
})
