import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRelationManagementAction = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('@/components/posts/post-card'), () => ({
  PostCard: ({
    post,
    hideBookmarkActions,
  }: {
    post: { id: string }
    hideBookmarkActions?: boolean
  }) => (
    <div
      data-testid={`post-card-${post.id}`}
      data-hide-bookmark-actions={String(Boolean(hideBookmarkActions))}
    />
  ),
}))

vi.mock(
  import('@/components/shared/empty-state'),
  () =>
    ({
      EmptyState: ({ title }: { title: string }) => <div data-testid='empty-state'>{title}</div>,
    }) as unknown as typeof import('@/components/shared/empty-state'),
)

vi.mock(import('../relation-management-action'), () => ({
  RelationManagementAction: (props: { entityId: string }) => {
    mockRelationManagementAction(props)
    return (
      <button
        type='button'
        data-testid={`relation-action-${props.entityId}`}
      >
        Action
      </button>
    )
  },
}))

import { UserPostRelationList } from '../user-post-relation-list'
import type { Post } from '@/types/posts'
import type { RelationManagementActionConfig } from '../relation-management-action'

function makePost(overrides?: Partial<Post>): Post {
  return {
    id: 'post-1',
    post_type: 'discussion',
    title: 'Test Post',
    markdown: '',
    root_id: null,
    parent_id: null,
    created_by_id: 'user-1',
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
  } as Post
}

const savedConfig: RelationManagementActionConfig = {
  entityType: 'post',
  predicate: 'save',
  activeLabel: 'extracted.userProfileCollections.postsTopics.saved_b5c120b3',
  inactiveLabel: 'extracted.userProfileCollections.postsTopics.save_1509f561',
  errorLabel: 'extracted.userProfileCollections.postsTopics.savedPost_f7486726',
}

describe('UserPostRelationList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty state when posts array is empty', () => {
    render(
      <UserPostRelationList
        posts={[]}
        emptyTitle='No posts'
        emptyDescription='Nothing here.'
      />,
    )
    expect(screen.getByTestId('empty-state')).toBeDefined()
    expect(screen.getByText('No posts')).toBeDefined()
  })

  it('renders a PostCard for each post without relationAction', () => {
    const posts = [makePost({ id: 'p-1' }), makePost({ id: 'p-2' })]
    render(
      <UserPostRelationList
        posts={posts}
        emptyTitle='No posts'
        emptyDescription='Nothing here.'
      />,
    )
    expect(screen.getByTestId('post-card-p-1')).toBeDefined()
    expect(screen.getByTestId('post-card-p-2')).toBeDefined()
    expect(screen.queryByTestId('empty-state')).toBeNull()
  })

  it('marks each relation row with its stable post ID', () => {
    render(
      <UserPostRelationList
        posts={[makePost({ id: 'p-1' }), makePost({ id: 'p-2' })]}
        emptyTitle='No posts'
        emptyDescription='Nothing here.'
      />,
    )
    expect(
      document.querySelector('[data-pw="post-relation-row"][data-post-id="p-1"]'),
    ).not.toBeNull()
    expect(
      document.querySelector('[data-pw="post-relation-row"][data-post-id="p-2"]'),
    ).not.toBeNull()
  })

  it('passes hideBookmarkActions=true to PostCard when relationAction is provided', () => {
    const posts = [makePost({ id: 'p-1' })]
    render(
      <UserPostRelationList
        posts={posts}
        emptyTitle='No posts'
        emptyDescription='Nothing here.'
        relationAction={savedConfig}
      />,
    )
    const card = screen.getByTestId('post-card-p-1')
    expect(card.getAttribute('data-hide-bookmark-actions')).toBe('true')
  })

  it('passes hideBookmarkActions=false to PostCard when no relationAction', () => {
    const posts = [makePost({ id: 'p-1' })]
    render(
      <UserPostRelationList
        posts={posts}
        emptyTitle='No posts'
        emptyDescription='Nothing here.'
      />,
    )
    const card = screen.getByTestId('post-card-p-1')
    expect(card.getAttribute('data-hide-bookmark-actions')).toBe('false')
  })

  it('renders RelationManagementAction for each post when relationAction is set', () => {
    const posts = [makePost({ id: 'p-1' }), makePost({ id: 'p-2' })]
    const onRemoved = vi.fn<(entityId: string) => void>()
    render(
      <UserPostRelationList
        posts={posts}
        emptyTitle='No posts'
        emptyDescription='Nothing here.'
        relationAction={savedConfig}
        onRemoved={onRemoved}
      />,
    )
    expect(screen.getByTestId('relation-action-p-1')).toBeDefined()
    expect(screen.getByTestId('relation-action-p-2')).toBeDefined()
    expect(mockRelationManagementAction).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'p-1', config: savedConfig, onRemoved }),
    )
  })

  it('does not render RelationManagementAction when no relationAction', () => {
    const posts = [makePost({ id: 'p-1' })]
    render(
      <UserPostRelationList
        posts={posts}
        emptyTitle='No posts'
        emptyDescription='Nothing here.'
      />,
    )
    expect(screen.queryByTestId('relation-action-p-1')).toBeNull()
  })
})
