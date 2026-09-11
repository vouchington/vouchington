import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetPost, mockGetPostDescendants, mockNotFound, mockRedirect } = vi.hoisted(() => ({
  mockGetPost: vi.fn<VitestLooseMock>(),
  mockGetPostDescendants: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('notFound')
  }),
  mockRedirect: vi.fn<VitestLooseMock>(() => {
    throw new Error('redirect')
  }),
}))

vi.mock(import('next/navigation'), () => ({
  notFound: mockNotFound as unknown as typeof import('next/navigation').notFound,
  redirect: mockRedirect as unknown as typeof import('next/navigation').redirect,
}))
vi.mock(import('@/lib/api/server'), () => ({
  getPost: mockGetPost,
  getPostDescendants: mockGetPostDescendants,
}))
vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>(() => Promise.resolve(null)),
}))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({ noIndex: true })),
  createPageMetadata: vi.fn<VitestLooseMock>(() => ({})),
  createExcerpt: vi.fn<VitestLooseMock>((s: string) => s?.slice(0, 20) ?? ''),
}))
vi.mock(import('@/lib/seo/post-schema'), () => ({
  createPostSchema: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(import('@/lib/seo/structured-data'), () => ({
  createBreadcrumbSchema: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(import('@/lib/seo/post-schema-helpers'), () => ({
  buildCommentsForSchema: vi.fn<VitestLooseMock>(() => []),
  buildInteractionStats: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(import('@/lib/seo/indexability'), () => ({
  isIndexableForSeo: vi.fn<VitestLooseMock>(() => true),
}))
vi.mock(import('@/lib/seo/schema-org-types'), () => ({
  getSchemaOrgType: vi.fn<VitestLooseMock>(() => 'Thing'),
}))
vi.mock(import('@/lib/post-helpers'), () => ({
  getPostCollectionLabel: vi.fn<VitestLooseMock>(() => 'Reviews'),
  getPostCollectionPath: vi.fn<VitestLooseMock>(() => '/reviews'),
  getPostPath: vi.fn<VitestLooseMock>(
    (_slug: string, post: { slug?: string; id: string }) => `/${_slug}/${post.slug ?? post.id}`,
  ),
  getPostSchemaKind: vi.fn<VitestLooseMock>(() => 'review'),
  getPostTitle: vi.fn<VitestLooseMock>((post: { title?: string }) => post.title ?? 'Untitled'),
  getVoteScoreNet: vi.fn<VitestLooseMock>(() => 5),
}))
vi.mock(import('@/lib/links/entity-href'), () => ({
  communityHref: vi.fn<VitestLooseMock>(
    (community: { slug: string }) => `/communities/${community.slug}`,
  ),
  createUserPathname: vi.fn<VitestLooseMock>(() => '/user/test'),
  topicHref: vi.fn<VitestLooseMock>(
    (topic: { topic_type: string; slug?: string; id: string }) =>
      `/${topic.topic_type}/${topic.slug ?? topic.id}`,
  ),
  userHref: vi.fn<VitestLooseMock>(() => '/user/test'),
}))
vi.mock(import('@/lib/permissions/can-see-downvotes'), () => ({
  canCurrentUserSeeDownvotes: vi.fn<VitestLooseMock>(() => true),
}))
vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='page-with-aside'>{children}</div>
  ),
}))
vi.mock(
  import('@/components/posts/post-detail-aside'),
  () =>
    ({
      PostDetailAside: () => null,
    }) as unknown as typeof import('@/components/posts/post-detail-aside'),
)
vi.mock(
  import('@/components/posts/post-detail'),
  () =>
    ({
      PostDetail: ({ community }: { community?: { name: string } | null }) => (
        <div
          data-testid='post-detail'
          data-community-name={community?.name ?? ''}
        />
      ),
    }) as unknown as typeof import('@/components/posts/post-detail'),
)
vi.mock(import('@/components/posts/post-detail-tabs'), () => ({
  PostDetailTabs: ({ commentCount }: { commentCount: number }) => (
    <div data-testid='post-detail-tabs'>{commentCount}</div>
  ),
}))
vi.mock(
  import('@/components/posts/post-comments'),
  () =>
    ({
      PostComments: () => null,
    }) as unknown as typeof import('@/components/posts/post-comments'),
)
vi.mock(
  import('@/components/posts/review-referral-programs'),
  () =>
    ({
      ReviewReferralPrograms: () => null,
    }) as unknown as typeof import('@/components/posts/review-referral-programs'),
)
vi.mock(
  import('@/components/disputes/review-dispute-entry'),
  () =>
    ({
      ReviewDisputeEntry: () => <div data-testid='review-dispute-entry' />,
    }) as unknown as typeof import('@/components/disputes/review-dispute-entry'),
)
vi.mock(
  import('@/components/posts/edit-post-page'),
  () =>
    ({
      EditPostPage: ({ id, postType, title }: { id: string; postType: string; title: string }) => (
        <div
          data-testid='edit-post-page'
          data-id={id}
          data-post-type={postType}
        >
          {title}
        </div>
      ),
    }) as unknown as typeof import('@/components/posts/edit-post-page'),
)
vi.mock(import('@/components/tags/manage-post-tags'), () => ({
  ManagePostTags: () => <div data-testid='manage-post-tags' />,
}))
vi.mock(
  import('@/components/seo/anonymous-structured-data-script'),
  () =>
    ({
      AnonymousStructuredDataScript: () => null,
    }) as unknown as typeof import('@/components/seo/anonymous-structured-data-script'),
)
vi.mock(
  import('@/components/ui/breadcrumb'),
  () =>
    ({
      Breadcrumbs: ({ items }: { items: Array<{ name: string; path: string }> }) => (
        <nav data-testid='breadcrumbs'>{items.map(i => `${i.name}@${i.path}`).join('|')}</nav>
      ),
    }) as unknown as typeof import('@/components/ui/breadcrumb'),
)
vi.mock(import('@/types/topics'), () => ({
  getTopicTypeSlug: vi.fn<VitestLooseMock>(() => 'topic'),
}))

import { render, screen } from '@testing-library/react'
import { createPostDetailPage } from '../post-route-factories'
import { createPostEditPage } from '../post-edit-factories'
import { getPost, getPostDescendants } from '@/lib/api/server'

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

const emptyDescendants = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  posts: {},
  posts_metrics: {},
}

describe('post factory functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getPost).mockResolvedValue(basePostResponse as never)
    vi.mocked(getPostDescendants).mockResolvedValue(emptyDescendants as never)
  })

  describe('createPostDetailPage', () => {
    const { default: ReviewDetailPage } = createPostDetailPage('review', 'review')
    it('renders PostDetail when post exists and type matches', async () => {
      const result = await ReviewDetailPage({ params: Promise.resolve({ id: 'post-1' }) })
      render(result)
      expect(screen.getByTestId('post-detail')).toBeDefined()
      expect(screen.getByTestId('post-detail-tabs')).toHaveTextContent('1000')
    })
    it('calls notFound when post is not found', async () => {
      vi.mocked(getPost).mockResolvedValue(null)
      await expect(
        ReviewDetailPage({ params: Promise.resolve({ id: 'missing' }) }),
      ).rejects.toThrow('notFound')
    })
    it('calls notFound when post type does not match the closed-over type', async () => {
      vi.mocked(getPost).mockResolvedValue({
        ...basePostResponse,
        post: { ...basePost, post_type: 'discussion' },
      } as never)
      await expect(ReviewDetailPage({ params: Promise.resolve({ id: 'post-1' }) })).rejects.toThrow(
        'notFound',
      )
    })
  })

  describe('createPostEditPage', () => {
    const { default: EditPage, generateMetadata } = createPostEditPage('review', 'review')

    it('renders EditPostPage with correct postType and title', async () => {
      const result = await EditPage({ params: Promise.resolve({ id: 'post-1' }) })
      render(result)
      const el = screen.getByTestId('edit-post-page')
      expect(el.getAttribute('data-post-type')).toBe('review')
      expect(el.getAttribute('data-id')).toBe('post-1')
      expect(el.textContent).toBe('Edit Review')
    })
    it('returns noindex metadata with the edit title', async () => {
      const metadata = await generateMetadata()
      expect(metadata).toEqual({ noIndex: true })
    })
    it('throws when called with a non-editable post type', () => {
      expect(() => createPostEditPage('story', 'story')).toThrow(
        'createPostEditPage called with non-editable post type',
      )
    })
  })
})
