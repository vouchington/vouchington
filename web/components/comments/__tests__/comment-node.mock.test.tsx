import { scoreVoteProps } from '@/test-helpers/components/comments/comment-node.mock-support'
import {
  createCommentNodeProps,
  makeCommentNode,
  makeCommentPost,
} from '@/test-helpers/components/comments/comment-node-fixtures'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen } from '@testing-library/react'

import { CommentNode } from '../comment-node'

const makePost = makeCommentPost
const makeNode = makeCommentNode
const defaultProps = createCommentNodeProps()

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
      makePost({ id: 'c2', parent_post_id: 'c1', created_by_id: 'user-2', slug: 'c2' }),
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
