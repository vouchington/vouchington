import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetPost, mockNotFound, mockRedirect } = vi.hoisted(() => ({
  mockGetPost: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('notFound')
  }),
  mockRedirect: vi.fn<VitestLooseMock>(() => {
    throw new Error('redirect')
  }),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: mockNotFound,
      redirect: mockRedirect,
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/server'), () => ({
  getPost: mockGetPost,
}))
vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>(() => Promise.resolve(null)),
}))
vi.mock(import('@/lib/permissions/can-see-downvotes'), () => ({
  canCurrentUserSeeDownvotes: vi.fn<VitestLooseMock>(() => true),
}))
vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: vi.fn<VitestLooseMock>(() => Promise.resolve({})),
}))
vi.mock(import('@/components/tags/manage-post-tags'), () => ({
  ManagePostTags: () => <div data-testid='manage-post-tags' />,
}))

import { render, screen } from '@testing-library/react'
import { createPostTagsPage } from '../post-edit-factories'
import { getPost } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'

const basePost = {
  id: 'post-1',
  title: 'Test Review',
  slug: 'test-review',
  post_type: 'review' as const,
  markdown: 'content',
  privacy: 'public' as const,
  broadcast: 'everyone' as const,
  is_anonymous: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  created_by: { id: 'u1', username: 'user1' },
  created_by_id: 'u1',
  post_related_topics: [],
  review_topic_ratings: [],
  images: [],
}

const basePostResponse = {
  post: basePost,
  post_metrics: {
    __entity_type: 'post_metrics',
    id: 'post-1',
    count: { descendants: 1000, children: 0, ancestors: 0 },
    bookmarks: { follow: 0, save: 0 },
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  post_election: null,
  election_vote: null,
  author_aside: null,
  html: '<p>content</p>',
  bookmarks: {},
}

describe('post tag route factory functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getPost).mockResolvedValue(basePostResponse as never)
  })

  describe('createPostTagsPage', () => {
    const { default: TagsPage } = createPostTagsPage('review', 'review')

    it('redirects to login when user is not authenticated', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(null)

      await expect(
        TagsPage({ params: Promise.resolve({ id: 'post-1', objectType: 'topic' }) }),
      ).rejects.toThrow('redirect')
      expect(mockRedirect).toHaveBeenCalledWith('/login')
    })

    it('calls notFound for invalid objectType', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u1', roles: [] } as never)

      await expect(
        TagsPage({ params: Promise.resolve({ id: 'post-1', objectType: 'invalid' }) }),
      ).rejects.toThrow('notFound')
    })

    it('calls notFound when post is not found', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u1', roles: [] } as never)
      vi.mocked(getPost).mockResolvedValue(null)

      await expect(
        TagsPage({ params: Promise.resolve({ id: 'missing', objectType: 'topic' }) }),
      ).rejects.toThrow('notFound')
    })

    it('renders ManagePostTags for authenticated user with valid post', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u1', roles: [] } as never)

      const result = await TagsPage({
        params: Promise.resolve({ id: 'post-1', objectType: 'topic' }),
      })
      render(result)
      expect(screen.getByTestId('manage-post-tags')).toBeDefined()
    })
  })
})
