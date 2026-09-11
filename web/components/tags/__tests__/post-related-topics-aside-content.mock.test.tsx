import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PostRelatedTopicsAsideContent } from '../post-related-topics-aside-content'
import type { Post } from '@/types/posts'
import type { EntityRelation } from '@/lib/api/entity-relations'
const { mockManageTagsDialog } = vi.hoisted(() => ({
  mockManageTagsDialog: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('../tag-list'), () => ({
  TagList: ({ relations }: { relations: EntityRelation[] }) => (
    <div data-testid='tag-list'>{relations.length} items</div>
  ),
}))
vi.mock(
  import('../manage-tags-dialog'),
  () =>
    ({
      ManageTagsDialog: (props: Record<string, unknown>) => {
        mockManageTagsDialog(props)
        return <div data-testid='manage-tags-dialog' />
      },
    }) as unknown as typeof import('../manage-tags-dialog'),
)

const mockPost: Post = {
  id: 'post-1',
  post_type: 'discussion',
  title: 'Test Post',
  markdown: '',
  root_id: null,
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
}

const mockRelation: EntityRelation = {
  id: 'rel-1',
  object_id: 'topic-1',
  created_at: '2024-01-01T00:00:00Z',
  created_by_id: 'user-1',
  object_data: { name: 'Test Topic', id: 'topic-1', slug: 'test-topic', topic_type: 'card' },
}

describe('PostRelatedTopicsAsideContent', () => {
  it('renders "Categories" heading (not "Related Topics")', () => {
    render(
      <PostRelatedTopicsAsideContent
        post={mockPost}
        relations={[mockRelation]}
        showManageButton={false}
      />,
    )
    expect(screen.getByText('Categories')).toBeDefined()
    expect(screen.queryByText('Related Topics')).toBeNull()
  })

  it('wires the manage dialog to /tags/topic when showManageButton is true', () => {
    render(
      <PostRelatedTopicsAsideContent
        post={mockPost}
        relations={[mockRelation]}
        showManageButton
      />,
    )
    expect(screen.getByTestId('manage-tags-dialog')).toBeDefined()
    expect(mockManageTagsDialog.mock.lastCall?.[0]?.manageHref).toBe(
      '/discussion/post-1/tags/topic',
    )
  })
})
