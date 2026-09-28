import { vi } from 'vitest'
import type { CommentNodeData } from '@/components/comments/comment-tree-utils'
import type { Post } from '@/types/posts'

function makeCommentPost(overrides: Partial<Post> = {}): Post {
  return {
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
  }
}

function makeCommentNode(post: Post, overrides: Partial<CommentNodeData> = {}): CommentNodeData {
  return {
    post,
    children: [],
    html: '<p>Hello</p>',
    ...overrides,
  }
}

function createCommentNodeProps() {
  return {
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
}

export { createCommentNodeProps, makeCommentNode, makeCommentPost }
