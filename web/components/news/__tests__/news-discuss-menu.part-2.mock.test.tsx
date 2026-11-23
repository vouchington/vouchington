import '@/test-helpers/components/shared/username-required-dialog.mock-support'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@/test-helpers/components/news/news-discuss-menu.mock-support'
import { useViewerHasCommunity } from '@/components/news/use-viewer-has-community'

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({ isAuthenticated: true }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

import { NewsDiscussMenu } from '../news-discuss-menu'

const EMPTY_URLS: Array<{ id: string; url: string }> = []
const mockUseViewerHasCommunity = vi.mocked(useViewerHasCommunity)

describe('NewsDiscussMenu part 2', () => {
  it('community item hidden when viewerHasCommunity=false and no communityDiscussionTarget', () => {
    mockUseViewerHasCommunity.mockReturnValue(false)
    render(
      <NewsDiscussMenu
        relatedPosts={[]}
        relatedUrlId='url-1'
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    expect(screen.queryByTestId('community-discussion-action')).toBeNull()
  })

  it('community item shown when communityDiscussionTarget provided (viewerHasCommunity=false)', () => {
    mockUseViewerHasCommunity.mockReturnValue(false)
    render(
      <NewsDiscussMenu
        relatedPosts={[]}
        relatedUrlId='url-1'
        communityDiscussionUrls={EMPTY_URLS}
        communityDiscussionTarget={{
          id: 'c1',
          name: 'Rewards',
          slug: 'rewards',
          visibility: 'public',
        }}
      />,
    )
    expect(screen.getByTestId('community-discussion-action')).toBeDefined()
  })

  it('data-pw="news-discuss-button" present in collapsed single-discuss branch', () => {
    mockUseViewerHasCommunity.mockReturnValue(false)
    const { container } = render(
      <NewsDiscussMenu
        relatedPosts={[]}
        relatedUrlId='url-1'
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    expect(container.querySelector('[data-pw="news-discuss-button"]')).not.toBeNull()
  })

  it('shows community item in dropdown when viewerHasCommunity=true alongside canDiscuss', () => {
    mockUseViewerHasCommunity.mockReturnValue(true)
    const { container } = render(
      <NewsDiscussMenu
        relatedPosts={[]}
        relatedUrlId='url-1'
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    expect(screen.getByTestId('community-discussion-action')).toBeDefined()
    expect(container.querySelector('[data-pw="news-discuss-create-item"]')).not.toBeNull()
  })
})
