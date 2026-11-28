import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@/test-helpers/components/news/news-discuss-menu.mock-support'

vi.mock(
  import('@/components/shared/username-required-dialog'),
  () =>
    ({
      UsernameRequiredDialog: ({ open }: { open: boolean }) =>
        open ? <div data-testid='username-required-dialog-stub' /> : null,
    }) as unknown as typeof import('@/components/shared/username-required-dialog'),
)

const mockAuthState = vi.hoisted(() => ({ isAuthenticated: true }))
vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => mockAuthState,
    }) as unknown as typeof import('@/lib/auth/context'),
)

import { NewsDiscussMenu } from '../news-discuss-menu'

const EMPTY_URLS: Array<{ id: string; url: string }> = []

function makePost(id: string, title: string) {
  return {
    id,
    post_type: 'discussion' as const,
    title,
    slug: id,
    markdown: '',
    root_post_id: null,
    created_by_id: 'u1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    deleted_by_id: null,
    archived_at: null,
    archived_by_id: null,
    broadcast: 'everyone' as const,
    privacy: 'public' as const,
    is_anonymous: false,
    community_id: null,
    clearance_status: 'approved' as const,
  }
}

describe('NewsDiscussMenu', () => {
  afterEach(() => {
    mockAuthState.isAuthenticated = true
  })
  it('returns null when totalActions === 0 (signed-out, no posts)', () => {
    mockAuthState.isAuthenticated = false
    const { container } = render(
      <NewsDiscussMenu
        relatedPosts={[]}
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows label "3 Posts" when n=3', () => {
    mockAuthState.isAuthenticated = false
    render(
      <NewsDiscussMenu
        relatedPosts={[makePost('p1', 'P1'), makePost('p2', 'P2'), makePost('p3', 'P3')]}
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    expect(screen.getByText('3 Posts')).toBeInTheDocument()
  })

  it('collapses to single Discuss button when canDiscuss only', () => {
    const { container } = render(
      <NewsDiscussMenu
        relatedPosts={[]}
        relatedUrlId='url-1'
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    const btn = container.querySelector('[data-pw="news-discuss-button"]')
    expect(btn).not.toBeNull()
    expect(btn?.tagName.toLowerCase()).toBe('button')
    expect(screen.getByText('Discuss')).toBeInTheDocument()
    expect(screen.queryByTestId('dropdown-separator')).toBeNull()
  })

  it('collapses to single post link button when 1 post and no other actions', () => {
    mockAuthState.isAuthenticated = false
    const { container } = render(
      <NewsDiscussMenu
        relatedPosts={[makePost('p1', 'My Discussion')]}
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    const btn = container.querySelector('[data-pw="news-discuss-button"]')
    expect(btn).not.toBeNull()
    expect(screen.getByText('My Discussion')).toBeInTheDocument()
  })

  it('renders dropdown when multiple actions (1 post + canDiscuss)', () => {
    const { container } = render(
      <NewsDiscussMenu
        relatedPosts={[makePost('p1', 'Post 1')]}
        relatedUrlId='url-1'
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    expect(screen.getByText('1 Post')).toBeInTheDocument()
    expect(container.querySelector('[data-pw="news-discuss-create-item"]')).not.toBeNull()
    expect(screen.getByTestId('dropdown-separator')).toBeInTheDocument()
  })

  it('renders post links when signed-out and has posts', () => {
    mockAuthState.isAuthenticated = false
    render(
      <NewsDiscussMenu
        relatedPosts={[makePost('p1', 'Signed-out Post')]}
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    expect(screen.getByText('Signed-out Post')).toBeInTheDocument()
  })
})
