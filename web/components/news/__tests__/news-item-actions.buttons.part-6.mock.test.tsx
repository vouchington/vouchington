import type { ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeRssFeedItem, makeRssFeedItemTopic } from '@/test-helpers/api-responses'

interface ToggleProps {
  active?: boolean
  initialActive?: boolean
  onActiveChange?: (value: boolean) => void
  pending?: boolean
  onPendingChange?: (value: boolean) => void
}
function Toggle({
  active,
  initialActive,
  onActiveChange,
  pending,
  onPendingChange,
  label,
}: ToggleProps & { label: string }) {
  const value = active ?? initialActive ?? false
  return (
    <button
      type='button'
      disabled={pending}
      onClick={() => {
        onActiveChange?.(!value)
        onPendingChange?.(true)
      }}
    >
      {value ? `${label}d` : label}
    </button>
  )
}

vi.mock(import('@/components/shared/save-button'), () => ({
  SaveButton: (props: ToggleProps) => (
    <Toggle
      {...props}
      label='Save'
    />
  ),
  SaveMenuItem: (props: ToggleProps) => (
    <Toggle
      {...props}
      label='Save'
    />
  ),
}))
vi.mock(import('@/components/shared/hide-button'), () => ({
  HideButton: (props: ToggleProps) => (
    <Toggle
      {...props}
      label='Hide'
    />
  ),
  HideMenuItem: (props: ToggleProps) => (
    <Toggle
      {...props}
      label='Hide'
    />
  ),
}))
vi.mock(import('@/components/news/news-discuss-menu'), () => ({ NewsDiscussMenu: () => null }))
vi.mock(
  import('@/components/shared/follower-share-actions'),
  () =>
    ({
      FollowerShareActions: ({ menuLeadingItems }: { menuLeadingItems?: ReactNode }) =>
        menuLeadingItems,
    }) as unknown as typeof import('@/components/shared/follower-share-actions'),
)
vi.mock(
  import('@/components/shared/report-menu-item'),
  () =>
    ({
      ReportMenuItem: () => null,
    }) as unknown as typeof import('@/components/shared/report-menu-item'),
)
vi.mock(
  import('@/components/feed/manage-categories-menu-item'),
  () =>
    ({
      ManageCategoriesMenuItem: () => null,
    }) as unknown as typeof import('@/components/feed/manage-categories-menu-item'),
)
vi.mock(
  import('@/components/lists/add-to-list-menu-item'),
  () =>
    ({
      AddToListMenuItem: () => null,
    }) as unknown as typeof import('@/components/lists/add-to-list-menu-item'),
)
vi.mock(import('@/components/votes/score-vote'), () => ({ ScoreVote: () => null }))
vi.mock(
  import('@/components/news/use-start-discussion-action'),
  () =>
    ({
      useStartDiscussionAction: () => null,
    }) as unknown as typeof import('@/components/news/use-start-discussion-action'),
)
vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({ isAuthenticated: true }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

import { NewsItemActions } from '../news-item-actions'

const item = makeRssFeedItem({
  id: 'item-a',
  data: { link: 'https://example.com', guid: 'g1', title: 'Article' },
  url: { id: 'url-1', url: 'https://example.com' },
  rss_feed: { id: 'feed-1', title: 'Feed', topic: makeRssFeedItemTopic({ id: 'topic-1' }) },
})

describe('NewsItemActions bookmark reset keys', () => {
  it('resets state from the next entity', () => {
    const { rerender } = render(
      <NewsItemActions
        item={item}
        relatedPosts={[]}
        variant='modal-footer'
        viewerBookmarks={{ hide: false, save: false }}
      />,
    )
    act(() => screen.getAllByRole('button', { name: 'Hide' })[0]!.click())
    expect(screen.getAllByRole('button', { name: 'Hided' })[0]).toBeVisible()

    rerender(
      <NewsItemActions
        item={{ ...item, id: 'item-b' }}
        relatedPosts={[]}
        variant='modal-footer'
        viewerBookmarks={{ hide: false, save: true }}
      />,
    )
    expect(screen.getAllByRole('button', { name: 'Hide' })[0]).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Saved' })[0]).toBeVisible()
  })

  it('resyncs initial flags for the same entity', () => {
    const { rerender } = render(
      <NewsItemActions
        item={item}
        relatedPosts={[]}
        variant='modal-footer'
        viewerBookmarks={{ hide: false, save: false }}
      />,
    )
    rerender(
      <NewsItemActions
        item={item}
        relatedPosts={[]}
        variant='modal-footer'
        viewerBookmarks={{ hide: true, save: true }}
      />,
    )
    expect(screen.getAllByRole('button', { name: 'Hided' })[0]).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Saved' })[0]).toBeVisible()
  })

  it('starts a fresh pending lifetime when returning to an entity', () => {
    const { rerender } = render(
      <NewsItemActions
        item={item}
        relatedPosts={[]}
        variant='modal-footer'
      />,
    )
    act(() => screen.getAllByRole('button', { name: 'Save' })[0]!.click())
    expect(screen.getAllByRole('button', { name: 'Saved' })[0]).toBeDisabled()

    rerender(
      <NewsItemActions
        item={{ ...item, id: 'item-b' }}
        relatedPosts={[]}
        variant='modal-footer'
      />,
    )
    rerender(
      <NewsItemActions
        item={item}
        relatedPosts={[]}
        variant='modal-footer'
      />,
    )

    expect(screen.getAllByRole('button', { name: 'Save' })[0]).toBeEnabled()
  })
})
