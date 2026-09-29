import { scoreVoteProps } from '@/test-helpers/components/comments/comment-node.mock-support'
import {
  createCommentNodeProps,
  makeCommentNode,
  makeCommentPost,
} from '@/test-helpers/components/comments/comment-node-fixtures'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen } from '@testing-library/react'

import { CommentNode } from '../comment-node'

const makePost = makeCommentPost
const makeNode = makeCommentNode
const defaultProps = createCommentNodeProps()

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
