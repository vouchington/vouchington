import { scoreVoteProps } from '@/test-helpers/components/comments/comment-node.mock-support'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen } from '@testing-library/react'

import { CommentNode } from '../comment-node'

import type { Post } from '@/types/posts'

import type { CommentNodeData } from '../comment-tree-utils'

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
