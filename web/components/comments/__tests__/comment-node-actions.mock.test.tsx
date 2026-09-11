import { afterEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CommentNodeActions } from '../comment-node-actions'
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
      }: {
        children: React.ReactNode
        href: string
        className?: string
      }) => (
        <a
          href={href}
          className={className}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('next/dynamic'), () => ({
  default: () => () => null,
}))

vi.mock(import('@/components/admin/admin-moderation-button'), () => ({
  default: () => <div data-testid='admin-moderation-button' />,
}))

vi.mock(import('@/lib/api/client/elections'), () => ({
  submitPostVote: vi.fn<VitestLooseMock>(),
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

vi.mock(import('@/components/votes/score-vote'), () => ({
  ScoreVote: () => <div data-testid='score-vote' />,
}))

vi.mock(import('@/components/shared/save-button'), () => ({
  SaveButton: ({ 'data-pw': dataPw }: { 'data-pw'?: string }) => (
    <button
      type='button'
      aria-label='Save'
      data-pw={dataPw}
    >
      Save
    </button>
  ),
}))

vi.mock(import('../delete-comment-button'), () => ({
  DeleteCommentButton: () => (
    <button
      type='button'
      data-pw='delete-comment-button'
    >
      Delete
    </button>
  ),
}))

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
  hideDownCount: false,
  isAdmin: false,
  permalink: '/discussion/root-1/comment/c1',
  replyToId: null as string | null,
  onQuote: vi.fn<VitestLooseMock>(),
  onToggleReply: vi.fn<VitestLooseMock>(),
  onStartEdit: vi.fn<VitestLooseMock>(),
  onDeleted: vi.fn<VitestLooseMock>(),
  isThreadLocked: false,
}

describe('CommentNodeActions', () => {
  afterEach(() => {
    mockAuthState.currentUser = null
    mockAuthState.isAuthenticated = false
  })

  it('isAuthenticated=false: no Save button', () => {
    const post = makePost()
    render(
      <CommentNodeActions
        {...defaultProps}
        node={makeNode(post)}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('isAuthenticated=true: Save button (data-pw="comment-save-button") visible', () => {
    mockAuthState.currentUser = { id: 'user-1' }
    mockAuthState.isAuthenticated = true
    const post = makePost()
    render(
      <CommentNodeActions
        {...defaultProps}
        node={makeNode(post)}
      />,
    )
    const saveBtn = screen.getByRole('button', { name: 'Save' })
    expect(saveBtn).toBeDefined()
    expect(saveBtn.getAttribute('data-pw')).toBe('comment-save-button')
  })

  it('isAuthenticated=true, isOwner=true, can_edit_content=true: Edit button visible', () => {
    mockAuthState.currentUser = { id: 'user-1' }
    mockAuthState.isAuthenticated = true
    const post = makePost({ can_edit_content: true })
    render(
      <CommentNodeActions
        {...defaultProps}
        node={makeNode(post)}
      />,
    )
    const editBtn = screen.getByRole('button', { name: /Edit/i })
    expect(editBtn).toBeDefined()
    expect(editBtn.getAttribute('data-pw')).toBe('comment-edit-button')
  })

  it('isAuthenticated=true, isOwner=true, can_edit_content=false: no Edit button', () => {
    mockAuthState.currentUser = { id: 'user-1' }
    mockAuthState.isAuthenticated = true
    const post = makePost({ can_edit_content: false })
    render(
      <CommentNodeActions
        {...defaultProps}
        node={makeNode(post)}
      />,
    )
    expect(screen.queryByRole('button', { name: /Edit/i })).toBeNull()
  })

  it('isAuthenticated=true, can_delete=true: Delete button visible', () => {
    mockAuthState.isAuthenticated = true
    const post = makePost({ can_delete: true })
    render(
      <CommentNodeActions
        {...defaultProps}
        node={makeNode(post)}
      />,
    )
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDefined()
  })

  it('isAuthenticated=true, isOwner=false, can_delete=false: no Edit or Delete', () => {
    mockAuthState.currentUser = { id: 'user-2' }
    mockAuthState.isAuthenticated = true
    const post = makePost({ can_edit_content: false, can_delete: false })
    render(
      <CommentNodeActions
        {...defaultProps}
        node={makeNode(post)}
      />,
    )
    expect(screen.queryByRole('button', { name: /Edit/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('Reply and Quote buttons are visible when the thread is unlocked', () => {
    const post = makePost()
    render(
      <CommentNodeActions
        {...defaultProps}
        node={makeNode(post)}
      />,
    )
    const replyButton = screen.getByRole('button', { name: /Reply/i })
    const quoteButton = screen.getByRole('button', { name: /Quote/i })
    expect(replyButton).toBeDefined()
    expect(quoteButton).toBeDefined()

    fireEvent.click(replyButton)
    fireEvent.click(quoteButton)

    expect(defaultProps.onToggleReply).toHaveBeenCalledWith('c1')
    expect(defaultProps.onQuote).toHaveBeenCalledWith(post)
  })

  it('hides Reply and Quote buttons when the thread is locked', () => {
    const post = makePost()
    render(
      <CommentNodeActions
        {...defaultProps}
        isThreadLocked
        node={makeNode(post)}
      />,
    )
    expect(screen.queryByRole('button', { name: /Reply/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Quote/i })).toBeNull()
    expect(screen.getByRole('link', { name: 'Permalink' })).toBeDefined()
  })

  it('hides Reply and Quote buttons when the comment is locked', () => {
    const post = makePost({ locked_at: '2026-06-01T00:00:00Z' })
    render(
      <CommentNodeActions
        {...defaultProps}
        node={makeNode(post)}
      />,
    )
    expect(screen.queryByRole('button', { name: /Reply/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Quote/i })).toBeNull()
    expect(screen.getByRole('link', { name: 'Permalink' })).toBeDefined()
  })

  it('Permalink link is always visible', () => {
    const post = makePost()
    render(
      <CommentNodeActions
        {...defaultProps}
        node={makeNode(post)}
      />,
    )
    expect(screen.getByRole('link', { name: 'Permalink' })).toBeDefined()
  })
})
