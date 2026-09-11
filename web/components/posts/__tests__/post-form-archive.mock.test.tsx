import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PostForm } from '../post-form'
import type { Post } from '@/types/posts'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({
        push: vi.fn<VitestLooseMock>(),
        back: vi.fn<VitestLooseMock>(),
      }),
    }) as unknown as typeof import('next/navigation'),
)

// PostSlugField (admin-only) reads useAuth; provide a non-admin user so it renders nothing.
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

const mockDiscussion: Post = {
  id: 'post-1',
  post_type: 'discussion',
  title: 'Existing Title',
  markdown: 'Existing content',
  root_id: null,
  created_by_id: 'user-1',
  created_at: '2026-05-17T20:00:00Z',
  updated_at: '2026-05-17T20:00:00Z',
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

describe('PostForm archive controls', () => {
  it('does not render archive controls in create mode', () => {
    render(<PostForm postType='discussion' />)

    fireEvent.click(screen.getByText('Advanced'))

    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Unarchive' })).toBeNull()
  })

  it('renders archive controls inside Advanced in edit mode', () => {
    render(
      <PostForm
        postType='discussion'
        post={mockDiscussion}
      />,
    )

    fireEvent.click(screen.getByText('Advanced'))

    expect(screen.getByRole('button', { name: 'Archive' })).toBeDefined()
  })
})
