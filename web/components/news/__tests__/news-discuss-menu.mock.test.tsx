import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { mockLucideReact } from '@/test-helpers/lucide-icons'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    Loader2: () => null,
    MessageSquare: () => null,
    MessageSquarePlus: () => null,
    Plus: () => null,
  }),
)

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: vi.fn<VitestLooseMock>(), success: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/api/client/posts'), () => ({
  createLinkPost: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/components/shared/username-required-dialog'),
  () =>
    ({
      UsernameRequiredDialog: ({ open }: { open: boolean }) =>
        open ? <div data-testid='username-required-dialog-stub' /> : null,
    }) as unknown as typeof import('@/components/shared/username-required-dialog'),
)

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuSeparator: () => <hr data-testid='dropdown-separator' />,
      DropdownMenuItem: ({
        children,
        disabled,
        onSelect,
        'data-pw': dataPw,
      }: {
        children: ReactNode
        disabled?: boolean
        onSelect?: (event: { preventDefault: () => void }) => void
        'data-pw'?: string
      }) => (
        <button
          type='button'
          data-pw={dataPw}
          disabled={disabled}
          onClick={() => onSelect?.({ preventDefault: vi.fn<VitestLooseMock>() })}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/dropdown-menu'),
)

vi.mock(import('@/components/news/use-viewer-has-community'), () => ({
  useViewerHasCommunity: vi.fn<() => boolean>().mockReturnValue(false),
}))

vi.mock(import('@/components/news/news-community-discussion-action'), () => ({
  NewsCommunityDiscussionAction: ({ fixedCommunity }: { fixedCommunity?: { name: string } }) => (
    <button
      type='button'
      data-testid='community-discussion-action'
    >
      {fixedCommunity ? `Discuss in ${fixedCommunity.name}` : 'Discuss with Community'}
    </button>
  ),
}))

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
    root_id: null,
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

  it('shows label "Discuss" when n=0', () => {
    render(
      <NewsDiscussMenu
        relatedPosts={[]}
        relatedUrlId='url-1'
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    expect(screen.getByText('Discuss')).toBeDefined()
  })

  it('shows label "1 Post" when n=1', () => {
    render(
      <NewsDiscussMenu
        relatedPosts={[makePost('p1', 'Post 1')]}
        relatedUrlId='url-1'
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    expect(screen.getByText('1 Post')).toBeDefined()
  })

  it('shows label "3 Posts" when n=3', () => {
    mockAuthState.isAuthenticated = false
    render(
      <NewsDiscussMenu
        relatedPosts={[makePost('p1', 'P1'), makePost('p2', 'P2'), makePost('p3', 'P3')]}
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    expect(screen.getByText('3 Posts')).toBeDefined()
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
    expect(screen.getByText('My Discussion')).toBeDefined()
  })

  it('renders dropdown when multiple actions (1 post + canDiscuss)', () => {
    const { container } = render(
      <NewsDiscussMenu
        relatedPosts={[makePost('p1', 'Post 1')]}
        relatedUrlId='url-1'
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    expect(screen.getByText('1 Post')).toBeDefined()
    expect(container.querySelector('[data-pw="news-discuss-create-item"]')).not.toBeNull()
  })

  it('shows DropdownMenuSeparator when posts + actions', () => {
    render(
      <NewsDiscussMenu
        relatedPosts={[makePost('p1', 'Post 1')]}
        relatedUrlId='url-1'
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    expect(screen.getByTestId('dropdown-separator')).toBeDefined()
  })

  it('renders post links when signed-out and has posts', () => {
    mockAuthState.isAuthenticated = false
    render(
      <NewsDiscussMenu
        relatedPosts={[makePost('p1', 'Signed-out Post')]}
        communityDiscussionUrls={EMPTY_URLS}
      />,
    )
    expect(screen.getByText('Signed-out Post')).toBeDefined()
  })
})
