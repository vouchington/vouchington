import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PostRelatedUrlsAsideContent } from '../post-related-urls-aside-content'
import type { Post } from '@/types/posts'
import type { EntityRelation } from '@/lib/api/entity-relations'
const { mockManageTagsDialog } = vi.hoisted(() => ({
  mockManageTagsDialog: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('../tag-list'), () => ({
  TagList: ({ relations, objectType }: { relations: EntityRelation[]; objectType: string }) => (
    <div data-testid='tag-list'>
      {objectType}: {relations.length} items
    </div>
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
  object_id: 'url-1',
  created_at: '2024-01-01T00:00:00Z',
  created_by_id: 'user-1',
  object_data: { url: 'https://example.com/page', id: 'url-1' },
}

describe('PostRelatedUrlsAsideContent', () => {
  it('renders only the supplied summary page without pagination', () => {
    render(
      <PostRelatedUrlsAsideContent
        post={mockPost}
        relations={[mockRelation, { ...mockRelation, id: 'rel-2', object_id: 'url-2' }]}
        showManageButton={false}
      />,
    )
    expect(screen.getByTestId('tag-list').textContent).toContain('url: 2 items')
  })

  it('renders "Related Links" heading', () => {
    render(
      <PostRelatedUrlsAsideContent
        post={mockPost}
        relations={[mockRelation]}
        showManageButton={false}
      />,
    )
    expect(screen.getByText('Related Links')).toBeDefined()
  })

  it('wires the manage dialog when showManageButton is true', () => {
    render(
      <PostRelatedUrlsAsideContent
        post={mockPost}
        relations={[mockRelation]}
        showManageButton
      />,
    )
    expect(screen.getByTestId('manage-tags-dialog')).toBeDefined()
    expect(mockManageTagsDialog.mock.lastCall?.[0]?.manageHref).toBe('/discussion/post-1/tags/url')
  })

  it('does not render Manage button when showManageButton is false', () => {
    render(
      <PostRelatedUrlsAsideContent
        post={mockPost}
        relations={[mockRelation]}
        showManageButton={false}
      />,
    )
    expect(screen.queryByTestId('manage-tags-dialog')).toBeNull()
  })
})
