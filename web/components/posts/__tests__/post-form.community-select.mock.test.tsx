import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PostForm } from '../post-form'
import { createCommunityPost, createPost } from '@/lib/api/client/posts'
import type { Post } from '@/types/posts'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: vi.fn<VitestLooseMock>(), back: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: { id: 'u1', roles: [] },
        isAuthenticated: true,
        logout: vi.fn<VitestLooseMock>(),
        setUser: vi.fn<VitestLooseMock>(),
      }),
    }) as unknown as typeof import('@/lib/auth/context'),
)
vi.mock(import('@/lib/api/client/posts'), () => ({
  createCommunityPost: vi.fn<VitestLooseMock>(),
  createPost: vi.fn<VitestLooseMock>(),
  updatePost: vi.fn<VitestLooseMock>(),
  archivePost: vi.fn<VitestLooseMock>(),
  unarchivePost: vi.fn<VitestLooseMock>(),
  addPostRating: vi.fn<VitestLooseMock>(),
  updatePostRating: vi.fn<VitestLooseMock>(),
  deletePostRating: vi.fn<VitestLooseMock>(),
  setPostImages: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('../post-form/community-select'), () => ({
  CommunitySelect: ({
    communities,
    value,
    onValueChange,
  }: {
    communities: { name: string; slug: string }[]
    value: string
    onValueChange: (value: string) => void
  }) => (
    <select
      aria-label='Community'
      value={value}
      onChange={event => onValueChange(event.currentTarget.value)}
    >
      <option value=''>No community</option>
      {communities.map(community => (
        <option
          key={community.slug}
          value={community.slug}
        >
          {community.name}
        </option>
      ))}
    </select>
  ),
}))
vi.mock(import('@/lib/api/client/markdown'), () => ({ previewMarkdown: vi.fn<VitestLooseMock>() }))
vi.mock(import('@/lib/api/client/images'), () => ({ uploadImageFile: vi.fn<VitestLooseMock>() }))
vi.mock(import('@/lib/api/client/financial-profile'), () => ({
  updateMyFinancialProfile: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/api/client/entity-relations'), () => ({
  createEntityRelation: vi.fn<VitestLooseMock>(),
}))
vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: vi.fn<VitestLooseMock>(), success: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

const mockCreateCommunityPost = vi.mocked(createCommunityPost)
const mockCreatePost = vi.mocked(createPost)

const mockDiscussion: Post = {
  id: 'post-1',
  post_type: 'discussion',
  title: 'Existing Title',
  markdown: 'Existing content',
  root_id: null,
  created_by_id: 'user-1',
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  broadcast: 'everyone',
  privacy: 'public',
  is_anonymous: false,
  community_id: 'community-1',
  clearance_status: 'approved',
}

describe('PostForm community selector', () => {
  beforeEach(() => {
    mockCreateCommunityPost.mockReset()
    mockCreatePost.mockReset()
  })

  it('updates selected community and resets audience defaults', async () => {
    mockCreateCommunityPost.mockResolvedValue({
      post: { ...mockDiscussion, id: 'selected-community-post-1', community_id: 'community-2' },
    })
    render(
      <PostForm
        postType='discussion'
        communityOptions={[
          {
            id: 'community-1',
            name: 'Public Community',
            slug: 'public-community',
            visibility: 'public',
            post_approval_required_at: null,
          },
          {
            id: 'community-2',
            name: 'Private Community',
            slug: 'private-community',
            visibility: 'private',
            post_approval_required_at: null,
          },
        ]}
      />,
    )

    fireEvent.change(screen.getByLabelText('Community'), {
      target: { value: 'private-community' },
    })
    fireEvent.change(screen.getByPlaceholderText('Give your post a title...'), {
      target: { value: 'Selected Community Title' },
    })
    fireEvent.change(screen.getByPlaceholderText('Write your post...'), {
      target: { value: 'Selected community content' },
    })
    fireEvent.click(screen.getByText('Post'))

    await waitFor(() => {
      expect(mockCreateCommunityPost).toHaveBeenCalledWith(
        'private-community',
        expect.objectContaining({
          title: 'Selected Community Title',
          broadcast: 'users',
          privacy: 'private',
        }),
      )
    })
  })

  it('resets back to global audience defaults when clearing the community', async () => {
    mockCreatePost.mockResolvedValue({
      post: { ...mockDiscussion, id: 'global-post-1', community_id: null },
    })
    render(
      <PostForm
        postType='discussion'
        communityOptions={[
          {
            id: 'community-2',
            name: 'Private Community',
            slug: 'private-community',
            visibility: 'private',
            post_approval_required_at: null,
          },
        ]}
        initialCommunitySlug='private-community'
      />,
    )

    fireEvent.change(screen.getByLabelText('Community'), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByPlaceholderText('Give your post a title...'), {
      target: { value: 'Global Community Title' },
    })
    fireEvent.change(screen.getByPlaceholderText('Write your post...'), {
      target: { value: 'Global community content' },
    })
    fireEvent.click(screen.getByText('Post'))

    await waitFor(() => {
      expect(mockCreatePost).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Global Community Title',
          broadcast: 'everyone',
          privacy: 'public',
        }),
      )
    })
    expect(mockCreateCommunityPost).not.toHaveBeenCalled()
  })
})
