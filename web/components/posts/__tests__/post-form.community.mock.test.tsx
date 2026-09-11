import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PostForm } from '../post-form'
import { createPost, createCommunityPost, updatePost } from '@/lib/api/client/posts'
import { communityPendingPostsHref } from '@/lib/links/entity-href'
import type { Post } from '@/types/posts'

const mockRouterPush = vi.fn<VitestLooseMock>()
const mockRouterBack = vi.fn<VitestLooseMock>()

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({
        push: mockRouterPush,
        back: mockRouterBack,
      }),
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
  archivePost: vi.fn<VitestLooseMock>(),
  createPost: vi.fn<VitestLooseMock>(),
  createCommunityPost: vi.fn<VitestLooseMock>(),
  updatePost: vi.fn<VitestLooseMock>(),
  unarchivePost: vi.fn<VitestLooseMock>(),
  addPostRating: vi.fn<VitestLooseMock>(),
  updatePostRating: vi.fn<VitestLooseMock>(),
  deletePostRating: vi.fn<VitestLooseMock>(),
  setPostImages: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/markdown'), () => ({
  previewMarkdown: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/api/client/images'), () => ({
  uploadImageFile: vi.fn<VitestLooseMock>(),
}))

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

const mockCreatePost = vi.mocked(createPost)
const mockCreateCommunityPost = vi.mocked(createCommunityPost)
const mockUpdatePost = vi.mocked(updatePost)

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

describe('PostForm community posts', () => {
  beforeEach(() => {
    mockRouterPush.mockClear()
    mockRouterBack.mockClear()
    mockCreatePost.mockReset()
    mockCreateCommunityPost.mockReset()
    mockUpdatePost.mockReset()
  })

  it('calls the community create endpoint for community posts', async () => {
    mockCreateCommunityPost.mockResolvedValue({
      post: { ...mockDiscussion, id: 'community-post-1', community_id: 'community-1' },
    })
    render(
      <PostForm
        postType='discussion'
        communityId='community-1'
        communitySlug='test-community'
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Give your post a title...'), {
      target: { value: 'Community Title' },
    })
    fireEvent.change(screen.getByPlaceholderText('Write your post...'), {
      target: { value: 'Community content' },
    })
    fireEvent.click(screen.getByText('Post'))

    await waitFor(() => {
      expect(mockCreatePost).not.toHaveBeenCalled()
      expect(mockCreateCommunityPost).toHaveBeenCalledWith('test-community', {
        community_id: 'community-1',
        post_type: 'discussion',
        title: 'Community Title',
        markdown: 'Community content',
        categories: [],
        declared_language: null,
        broadcast: 'everyone',
        privacy: 'public',
        is_anonymous: false,
        hp_website: '',
        hp_phone: '',
        cf_turnstile_response: 'test-turnstile-token',
        recaptcha_token: 'test-recaptcha-token',
      })
    })
    expect(mockRouterPush).toHaveBeenCalledWith('/discussion/community-post-1')
  })
  it('defaults private community posts to signed-in private visibility', async () => {
    mockCreateCommunityPost.mockResolvedValue({
      post: {
        ...mockDiscussion,
        id: 'private-community-post-1',
        community_id: 'community-1',
        clearance_status: 'approved',
        broadcast: 'users',
        privacy: 'private',
      },
    })
    render(
      <PostForm
        postType='discussion'
        communityId='community-1'
        communitySlug='private-community'
        communityVisibility='private'
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Give your post a title...'), {
      target: { value: 'Private Community Title' },
    })
    fireEvent.change(screen.getByPlaceholderText('Write your post...'), {
      target: { value: 'Private community content' },
    })
    fireEvent.click(screen.getByText('Advanced'))

    expect(screen.queryByText('Everyone')).toBeNull()
    expect(screen.getAllByText('Users').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('Post'))
    await waitFor(() => {
      expect(mockCreateCommunityPost).toHaveBeenCalledWith(
        'private-community',
        expect.objectContaining({ broadcast: 'users', privacy: 'private' }),
      )
    })
  })
  it('redirects pending community submissions to the community pending destination', async () => {
    const pendingPath = communityPendingPostsHref({ slug: 'approval-community' })
    mockCreateCommunityPost.mockResolvedValue({
      post: { ...mockDiscussion, id: 'pending-community-post-1', community_id: 'community-1' },
    })
    render(
      <PostForm
        postType='discussion'
        communityId='community-1'
        communitySlug='approval-community'
        communityPendingRedirectPath={pendingPath}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Give your post a title...'), {
      target: { value: 'Pending Community Title' },
    })
    fireEvent.change(screen.getByPlaceholderText('Write your post...'), {
      target: { value: 'Pending community content' },
    })
    fireEvent.click(screen.getByText('Post'))
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith(pendingPath)
    })
  })
  it('uses an eligible initial community slug on global create pages', async () => {
    mockCreateCommunityPost.mockResolvedValue({
      post: { ...mockDiscussion, id: 'initial-community-post-1', community_id: 'community-1' },
    })
    render(
      <PostForm
        postType='discussion'
        initialCommunitySlug='eligible-community'
        communityOptions={[
          {
            id: 'community-1',
            name: 'Eligible Community',
            slug: 'eligible-community',
            visibility: 'public',
            post_approval_required_at: null,
          },
        ]}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Give your post a title...'), {
      target: { value: 'Initial Community Title' },
    })
    fireEvent.change(screen.getByPlaceholderText('Write your post...'), {
      target: { value: 'Initial community content' },
    })
    fireEvent.click(screen.getByText('Post'))
    await waitFor(() => {
      expect(mockCreatePost).not.toHaveBeenCalled()
      expect(mockCreateCommunityPost).toHaveBeenCalledWith(
        'eligible-community',
        expect.objectContaining({
          title: 'Initial Community Title',
          markdown: 'Initial community content',
        }),
      )
    })
  })
  it('uses pending redirects from an eligible initial community option', async () => {
    mockCreateCommunityPost.mockResolvedValue({
      post: { ...mockDiscussion, id: 'pending-initial-community-post-1' },
    })
    render(
      <PostForm
        postType='discussion'
        initialCommunitySlug='approval-community'
        communityOptions={[
          {
            id: 'community-1',
            name: 'Approval Community',
            slug: 'approval-community',
            visibility: 'public',
            post_approval_required_at: '2026-01-01T00:00:00.000Z',
          },
        ]}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Give your post a title...'), {
      target: { value: 'Pending Initial Title' },
    })
    fireEvent.change(screen.getByPlaceholderText('Write your post...'), {
      target: { value: 'Pending initial content' },
    })
    fireEvent.click(screen.getByText('Post'))
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith(
        communityPendingPostsHref({ slug: 'approval-community' }),
      )
    })
  })
  it('treats edited community posts as community-scoped without a community slug prop', async () => {
    mockUpdatePost.mockResolvedValue({
      post: {
        ...mockDiscussion,
        broadcast: 'users',
        privacy: 'private',
      },
    })
    render(
      <PostForm
        postType='discussion'
        post={{ ...mockDiscussion, broadcast: 'followers', privacy: 'private' }}
        communityVisibility='private'
      />,
    )
    fireEvent.click(screen.getByText('Advanced'))
    expect(screen.queryByText('Everyone')).toBeNull()
    expect(screen.queryByText('Followers')).toBeNull()
    expect(screen.queryByText('Mutual Followers')).toBeNull()
    fireEvent.click(screen.getByText('Save Changes'))
    await waitFor(() => {
      expect(mockUpdatePost).toHaveBeenCalledWith(
        'post-1',
        expect.objectContaining({ broadcast: 'users', privacy: 'private' }),
      )
    })
  })
})
