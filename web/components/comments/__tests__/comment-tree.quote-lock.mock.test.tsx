import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommentTree } from '../comment-tree'
import type { CommentNodeData } from '../comment-tree-utils'
import type { PostsResponseBody } from '@/types/api-responses'
import type { Post } from '@/types/posts'

const mockTreeState = vi.hoisted(() => ({
  commentNodes: [] as CommentNodeData[],
  sort: 'new' as 'new' | 'best',
  setSort: vi.fn<(value: 'new' | 'best') => void>(),
  setQuoteMarkdown: vi.fn<(value: string) => void>(),
  setReplyToId: vi.fn<(value: string | null) => void>(),
  collapsedIds: new Set<string>(),
  replyToId: null as string | null,
  quoteMarkdown: '',
  handleToggleCollapse: vi.fn<(id: string) => void>(),
  handleCommentAdded: vi.fn<(parentId: string, comment: Post, html?: string) => void>(),
}))

vi.mock(import('@/lib/auth/context'), () => ({
  useAuth: () => ({ currentUser: null, isAuthenticated: false }),
}))

vi.mock(
  import('../use-comment-tree-state'),
  () =>
    ({
      useCommentTreeState: () => mockTreeState,
    }) as unknown as typeof import('../use-comment-tree-state'),
)

vi.mock(import('../comment-node'), () => ({
  CommentNode: ({ node, onQuote }: { node: CommentNodeData; onQuote: (comment: Post) => void }) => (
    <button
      type='button'
      onClick={() => onQuote(node.post)}
    >
      Quote {node.post.id}
    </button>
  ),
}))

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      SelectTrigger: ({ children }: { children: React.ReactNode }) => (
        <button type='button'>{children}</button>
      ),
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

vi.mock(
  import('../comment-reply-form'),
  () =>
    ({
      CommentReplyForm: () => null,
    }) as unknown as typeof import('../comment-reply-form'),
)

const data: PostsResponseBody = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  posts: {},
  posts_metrics: {},
  markdown_to_html: {},
}

function makeComment(overrides: Partial<Post> = {}): Post {
  return {
    id: 'comment-1',
    post_type: 'comment',
    title: '',
    slug: 'comment-1',
    markdown: 'Comment',
    root_id: 'root-1',
    parent_id: 'root-1',
    created_by_id: 'user-1',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    deleted_at: null,
    deleted_by_id: null,
    archived_at: null,
    archived_by_id: null,
    locked_at: null,
    locked_by_id: null,
    broadcast: 'everyone',
    privacy: 'public',
    is_anonymous: false,
    community_id: null,
    clearance_status: 'approved',
    ...overrides,
  }
}

describe('CommentTree quote locking', () => {
  beforeEach(() => {
    mockTreeState.commentNodes = []
    mockTreeState.setQuoteMarkdown.mockClear()
    mockTreeState.setReplyToId.mockClear()
  })

  it('does not quote an individually locked comment', () => {
    const lockedComment = makeComment({ locked_at: '2026-06-01T00:00:00Z' })
    mockTreeState.commentNodes = [{ post: lockedComment, children: [], html: '<p>Comment</p>' }]

    render(
      <CommentTree
        data={data}
        rootPostId='root-1'
        rootPostType='discussion'
        rootLockedAt={null}
        isAdmin={false}
        hideDownCount={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Quote comment-1' }))

    expect(mockTreeState.setQuoteMarkdown).not.toHaveBeenCalled()
    expect(mockTreeState.setReplyToId).not.toHaveBeenCalled()
  })
})
