import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Post } from '@/types/posts'
import type { User } from '@/types/user'
let mockCurrentUser: User | null = null
vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: mockCurrentUser,
        isAuthenticated: mockCurrentUser != null,
      }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(
  import('@/components/shared/use-follower-share-actions'),
  () =>
    ({
      // Only isDialogOpen matters here — FollowerSendDialog and FollowerShareMenuItems are both mocked
      useFollowerShareActions: () => ({ isDialogOpen: false }),
    }) as unknown as typeof import('@/components/shared/use-follower-share-actions'),
)

vi.mock(
  import('@/components/shared/follower-send-dialog'),
  () =>
    ({
      FollowerSendDialog: ({ open }: { open: boolean }) =>
        open ? <div data-testid='follower-send-dialog' /> : null,
    }) as unknown as typeof import('@/components/shared/follower-send-dialog'),
)

vi.mock(import('@/components/shared/report-menu-item'), () => ({
  ReportMenuItem: () => (
    <button
      type='button'
      role='menuitem'
      data-testid='report-menu-item'
    >
      Report
    </button>
  ),
}))
vi.mock(import('../follower-share-menu-items'), () => ({
  FollowerShareMenuItems: () => (
    <>
      <button
        type='button'
        role='menuitem'
        data-testid='follower-share-menu-share'
      >
        Share
      </button>
      <button
        type='button'
        role='menuitem'
        data-testid='follower-share-menu-send'
      >
        Send
      </button>
    </>
  ),
}))

vi.mock(import('../delete-post-menu-item'), () => ({
  DeletePostMenuItem: () => (
    <button
      type='button'
      role='menuitem'
      data-testid='post-delete-trigger'
    >
      Delete
    </button>
  ),
}))

vi.mock(import('../post-lock-menu-item'), () => ({
  PostLockMenuItem: () => (
    <button
      type='button'
      role='menuitem'
      data-testid='post-lock-button'
    >
      Lock
    </button>
  ),
}))

vi.mock(import('../unpublish-from-community-menu-item'), () => ({
  UnpublishFromCommunityMenuItem: () => (
    <button
      type='button'
      role='menuitem'
      data-testid='post-unpublish-from-community-trigger'
    >
      Unpublish
    </button>
  ),
}))

vi.mock(import('../shareability'), () => ({
  canSharePost: vi.fn<VitestLooseMock>().mockReturnValue(true),
}))

vi.mock(import('@/lib/links/entity-href'), () => ({
  createPostPathname: vi.fn<VitestLooseMock>().mockReturnValue('/discussion/test/edit'),
}))

vi.mock(import('@/lib/route-configs'), () => ({
  getPostSlugFromType: vi.fn<VitestLooseMock>().mockReturnValue('discussion'),
}))

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    MoreHorizontal: () => <svg data-testid='more-horizontal-icon' />,
  }),
)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuItem: ({
        children,
        onSelect,
        disabled,
      }: {
        children: ReactNode
        onSelect?: (e: Event) => void
        disabled?: boolean
      }) => (
        <button
          type='button'
          role='menuitem'
          disabled={disabled}
          onClick={() => onSelect?.(new Event('select'))}
        >
          {children}
        </button>
      ),
      DropdownMenuSeparator: () => <hr />,
    }) as unknown as typeof import('@/components/ui/dropdown-menu'),
)

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({ children, ...props }: { children: ReactNode; [k: string]: unknown }) => (
        <button
          type='button'
          {...props}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/button'),
)

import { PostDetailOverflowMenu } from '../post-detail-overflow-menu'
const basePost: Post = {
  id: 'post-1',
  post_type: 'discussion',
  markdown: 'Hello',
  root_id: null,
  created_by_id: 'author-1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  broadcast: 'everyone',
  privacy: 'public',
  is_anonymous: false,
  community_id: null,
  clearance_status: 'approved',
  title: 'Test post',
}

describe('PostDetailOverflowMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrentUser = null
  })

  it('renders null when not authenticated', () => {
    const { container } = render(<PostDetailOverflowMenu post={basePost} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders null when authenticated as the post owner with no special permissions', () => {
    mockCurrentUser = { id: 'author-1', roles: [] } as User
    const { container } = render(<PostDetailOverflowMenu post={basePost} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders share and send items for authenticated non-owner on shareable post', () => {
    mockCurrentUser = { id: 'viewer-1', roles: [] } as User
    render(<PostDetailOverflowMenu post={basePost} />)
    expect(screen.getByTestId('follower-share-menu-share')).toBeDefined()
    expect(screen.getByTestId('follower-share-menu-send')).toBeDefined()
  })

  it('renders Report item for authenticated non-owner', () => {
    mockCurrentUser = { id: 'viewer-1', roles: [] } as User
    render(<PostDetailOverflowMenu post={basePost} />)
    expect(screen.getByTestId('report-menu-item')).toBeDefined()
  })

  it('renders Edit link when user can edit', () => {
    mockCurrentUser = { id: 'author-1', roles: [] } as User
    const post: Post = { ...basePost, can_edit_content: true }
    render(<PostDetailOverflowMenu post={post} />)
    expect(screen.getByRole('link', { name: /edit/i })).toBeDefined()
  })

  it('renders Delete item when user can delete', () => {
    mockCurrentUser = { id: 'author-1', roles: [] } as User
    const post: Post = { ...basePost, can_delete: true }
    render(<PostDetailOverflowMenu post={post} />)
    expect(screen.getByTestId('post-delete-trigger')).toBeDefined()
  })

  it('renders Lock item when user can lock', () => {
    mockCurrentUser = { id: 'author-1', roles: ['administrator'] } as User
    const post: Post = { ...basePost, can_lock: true }
    render(<PostDetailOverflowMenu post={post} />)
    expect(screen.getByTestId('post-lock-button')).toBeDefined()
  })

  it('renders Unpublish item when user can unpublish and post has a community', () => {
    mockCurrentUser = { id: 'author-1', roles: [] } as User
    const post: Post = {
      ...basePost,
      community_id: 'community-1',
      can_unpublish_from_community: true,
    }
    render(<PostDetailOverflowMenu post={post} />)
    expect(screen.getByTestId('post-unpublish-from-community-trigger')).toBeDefined()
  })

  it('renders the More actions trigger button when any item is available', () => {
    mockCurrentUser = { id: 'viewer-1', roles: [] } as User
    render(<PostDetailOverflowMenu post={basePost} />)
    expect(screen.getByRole('button', { name: /more actions/i })).toBeDefined()
  })
})
