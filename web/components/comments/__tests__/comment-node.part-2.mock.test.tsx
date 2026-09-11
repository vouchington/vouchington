import { describe, it, expect, vi, beforeEach } from 'vitest'

import { render, screen, fireEvent } from '@testing-library/react'

import type { ReactNode, MouseEventHandler } from 'react'

import { CommentNode } from '../comment-node'

import type { Post, ElectionVote } from '@/types/posts'

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

vi.mock(import('@/lib/auth/context'), () => ({
  useAuth: () => ({ currentUser: null, isAuthenticated: false }),
}))

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

  it('clicking the username link does NOT call onToggleCollapse', () => {
    const onToggleCollapse = vi.fn<VitestLooseMock>()
    const post = makePost()
    render(
      <CommentNode
        {...defaultProps}
        node={makeNode(post)}
        onToggleCollapse={onToggleCollapse}
      />,
    )

    const links = screen.getAllByTestId('user-link')
    const usernameLink = links.find(el => el.textContent === 'alice')
    expect(usernameLink).toBeDefined()
    fireEvent.click(usernameLink!)

    expect(onToggleCollapse).not.toHaveBeenCalled()
  })

  it('clicking the chevron button calls onToggleCollapse exactly once (no double-fire)', () => {
    const onToggleCollapse = vi.fn<VitestLooseMock>()
    const post = makePost()
    render(
      <CommentNode
        {...defaultProps}
        node={makeNode(post)}
        onToggleCollapse={onToggleCollapse}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Collapse comment thread' }))
    expect(onToggleCollapse).toHaveBeenCalledTimes(1)
  })

  it('shows rendered markdown when markdownToHtml contains the comment id', () => {
    const post = makePost()
    render(
      <CommentNode
        {...defaultProps}
        node={makeNode(post, { html: '<strong>bold</strong>' })}
      />,
    )

    expect(screen.getByTestId('markdown').textContent).toBe('<strong>bold</strong>')
    expect(screen.queryByText('Hello')).toBeNull()
  })

  it('falls back to plain text when markdownToHtml does not contain the comment id', () => {
    const post = makePost()
    render(
      <CommentNode
        {...defaultProps}
        node={makeNode(post, { html: null })}
      />,
    )

    expect(screen.queryByTestId('markdown')).toBeNull()
    expect(screen.getByText('Hello')).toBeDefined()
  })
})
