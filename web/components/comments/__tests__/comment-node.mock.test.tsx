import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'

import { render, screen, fireEvent } from '@testing-library/react'

import type { ReactNode, MouseEventHandler } from 'react'

import { CommentNode } from '../comment-node'

import type { Post } from '@/types/posts'

import type { CommentNodeData } from '../comment-tree-utils'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        className,
        onClick,
      }: {
        children: ReactNode
        href: string
        className?: string
        onClick?: MouseEventHandler<HTMLElement>
      }) => (
        <a
          href={href}
          className={className}
          onClick={onClick}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(
  import('next/dynamic'),
  () =>
    ({
      default: (fn: () => Promise<{ default: () => null }>) => {
        void fn()
        return () => null
      },
    }) as unknown as typeof import('next/dynamic'),
)

vi.mock(import('@/components/admin/admin-moderation-button'), () => ({
  default: () => <div data-testid='admin-moderation-button' />,
}))

vi.mock(import('@/components/shared/report-menu-item'), () => ({
  ReportMenuKebab: () => <div data-pw='report-menu-kebab' />,
}))

vi.mock(
  import('@/components/shared/time-ago'),
  () =>
    ({
      TimeAgo: ({ date }: { date: string }) => <span>{date}</span>,
    }) as unknown as typeof import('@/components/shared/time-ago'),
)

vi.mock(import('@/components/shared/agent-badge'), () => ({
  AgentBadge: () => <span>Agent</span>,
}))

vi.mock(
  import('@/components/shared/markdown-content'),
  () =>
    ({
      MARKDOWN_CONTENT_FEATURES_RICH: { code: true, images: true, utm: true },
      MarkdownContent: ({ html }: { html: string }) => <div data-testid='markdown'>{html}</div>,
    }) as unknown as typeof import('@/components/shared/markdown-content'),
)

vi.mock(import('@/components/shared/user-avatar'), () => ({
  UserAvatar: ({ username }: { username: string }) => <span data-testid='avatar'>{username}</span>,
}))

vi.mock(
  import('@/components/users/user-link'),
  () =>
    ({
      UserLink: ({
        children,
        user,
        tab,
        className,
        onClick,
      }: {
        children: ReactNode
        user: { id: string; username?: string | null }
        tab?: string
        className?: string
        onClick?: MouseEventHandler<HTMLElement>
      }) => (
        <a
          data-testid='user-link'
          href={`/user/${user.username ?? user.id}/${tab ?? ''}`}
          className={className}
          onClick={onClick}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('@/components/users/user-link'),
)

const scoreVoteProps: Array<{ existingVoteChoice?: string }> = []

vi.mock(import('@/components/votes/score-vote'), () => ({
  ScoreVote: (props: { existingVoteChoice?: string }) => {
    scoreVoteProps.push(props)
    return <div data-testid='score-vote'>votes</div>
  },
}))

vi.mock(import('@/lib/api/client/elections'), () => ({
  submitPostVote: vi.fn<VitestLooseMock>(),
  clearPostVote: vi.fn<VitestLooseMock>(),
}))

const mockAuthState = vi.hoisted(() => ({
  currentUser: null as { id: string } | null,
  isAuthenticated: false,
}))
vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => mockAuthState,
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(
  import('../comment-reply-form'),
  () =>
    ({
      CommentReplyForm: () => null,
    }) as unknown as typeof import('../comment-reply-form'),
)

const makePost = (overrides: Partial<Post> = {}): Post => ({
  id: 'c1',
  post_type: 'comment',
  title: '',
  slug: 'c1',
  markdown: 'Hello',
  root_id: 'root-1',
  parent_id: 'root-1',
  created_by_id: 'user-1',
  created_by: { __entity_type: 'user', id: 'user-1', username: 'alice', profile_image_id: null },
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
  ...overrides,
})

const makeNode = (post: Post, overrides: Partial<CommentNodeData> = {}): CommentNodeData => ({
  post,
  children: [],
  html: '<p>Hello</p>',
  ...overrides,
})

const defaultProps = {
  depth: 0,
  rootPostId: 'root-1',
  rootPostType: 'discussion',
  collapsedIds: new Set<string>(),
  replyToId: null as string | null,
  quoteMarkdown: '',
  onToggleCollapse: vi.fn<VitestLooseMock>(),
  onToggleReply: vi.fn<VitestLooseMock>(),
  onCommentAdded: vi.fn<VitestLooseMock>(),
  onQuote: vi.fn<VitestLooseMock>(),
  isAdmin: false,
  isThreadLocked: false,
}

describe('CommentNode', () => {
  beforeEach(() => {
    scoreVoteProps.length = 0
  })

  afterEach(() => {
    mockAuthState.currentUser = null
    mockAuthState.isAuthenticated = false
  })

  it('derives recursive child authentication from auth context', () => {
    mockAuthState.currentUser = { id: 'viewer-1' }
    mockAuthState.isAuthenticated = true
    const child = makeNode(
      makePost({ id: 'c2', parent_id: 'c1', created_by_id: 'user-2', slug: 'c2' }),
    )
    render(
      <CommentNode
        {...defaultProps}
        node={makeNode(makePost(), { children: [child] })}
      />,
    )

    expect(document.querySelectorAll('[data-pw="comment-save-button"]')).toHaveLength(2)
  })

  it('renders username as a UserLink to /user/:username/comments for logged-in author', () => {
    const post = makePost()
    render(
      <CommentNode
        {...defaultProps}
        node={makeNode(post)}
      />,
    )

    const links = screen.getAllByTestId('user-link')
    const usernameLink = links.find(el => el.textContent === 'alice')
    expect(usernameLink).toBeDefined()
    expect(usernameLink?.getAttribute('href')).toContain('/user/alice')
    expect(usernameLink?.getAttribute('href')).toContain('comments')
  })

  it('renders plain span for anonymous author (no link)', () => {
    const post = makePost({ is_anonymous: true, created_by: null })
    render(
      <CommentNode
        {...defaultProps}
        node={makeNode(post)}
      />,
    )

    expect(screen.queryByTestId('user-link')).toBeNull()
    expect(screen.getByText('Anonymous')).toBeDefined()
  })

  it('renders plain span [deleted] for deleted comment (no link)', () => {
    const post = makePost({ deleted_at: '2024-01-02T00:00:00Z' })
    render(
      <CommentNode
        {...defaultProps}
        node={makeNode(post)}
      />,
    )

    expect(screen.queryByTestId('user-link')).toBeNull()
    // [deleted] appears in both the header span and the body paragraph
    const deletedEls = screen.getAllByText('[deleted]')
    expect(deletedEls.length).toBeGreaterThan(0)
  })

  it('clicking the metadata row calls onToggleCollapse exactly once', () => {
    const onToggleCollapse = vi.fn<VitestLooseMock>()
    const post = makePost()
    render(
      <CommentNode
        {...defaultProps}
        node={makeNode(post)}
        onToggleCollapse={onToggleCollapse}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Collapse comment metadata row' }))

    expect(onToggleCollapse).toHaveBeenCalledTimes(1)
    expect(onToggleCollapse).toHaveBeenCalledWith('c1')
  })

  it('does not toggle collapse when the author link is clicked', () => {
    const onToggleCollapse = vi.fn<VitestLooseMock>()
    const post = makePost()
    render(
      <CommentNode
        {...defaultProps}
        node={makeNode(post)}
        onToggleCollapse={onToggleCollapse}
      />,
    )

    const usernameLink = screen.getAllByTestId('user-link').find(el => el.textContent === 'alice')
    expect(usernameLink).toBeDefined()

    fireEvent.click(usernameLink!)

    expect(onToggleCollapse).not.toHaveBeenCalled()
  })
})
