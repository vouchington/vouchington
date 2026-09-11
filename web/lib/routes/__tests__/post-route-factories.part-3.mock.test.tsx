import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetPost, mockGetPostDescendants, mockNotFound } = vi.hoisted(() => ({
  mockGetPost: vi.fn<VitestLooseMock>(),
  mockGetPostDescendants: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('notFound')
  }),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: mockNotFound,
    }) as unknown as typeof import('next/navigation'),
)
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
  communityHref: vi.fn<VitestLooseMock>(() => '/communities/test'),
  topicHref: vi.fn<VitestLooseMock>(() => '/topic/test'),
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
      PostDetail: () => <div data-testid='post-detail' />,
    }) as unknown as typeof import('@/components/posts/post-detail'),
)
vi.mock(
  import('@/components/posts/post-detail-tabs'),
  () =>
    ({
      PostDetailTabs: () => null,
    }) as unknown as typeof import('@/components/posts/post-detail-tabs'),
)
vi.mock(
  import('@/components/posts/post-comments'),
  () =>
    ({ PostComments: () => null }) as unknown as typeof import('@/components/posts/post-comments'),
)
vi.mock(
  import('@/components/posts/review-referral-programs'),
  () =>
    ({
      ReviewReferralPrograms: () => null,
    }) as unknown as typeof import('@/components/posts/review-referral-programs'),
)
vi.mock(
  import('@/components/seo/anonymous-structured-data-script'),
  () =>
    ({
      AnonymousStructuredDataScript: () => null,
    }) as unknown as typeof import('@/components/seo/anonymous-structured-data-script'),
)
vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => null,
}))
vi.mock(
  import('@/components/disputes/review-dispute-entry'),
  () =>
    ({
      ReviewDisputeEntry: () => <div data-testid='review-dispute-entry' />,
    }) as unknown as typeof import('@/components/disputes/review-dispute-entry'),
)

import { render, screen } from '@testing-library/react'
import { createPostDetailPage } from '../post-route-factories'
import { getPost, getPostDescendants } from '@/lib/api/server'
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
    count: { descendants: 0, children: 0, ancestors: 0 },
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

const baseReviewRating = {
  topic_id: 'topic-1',
  rating: 4,
  order_index: 0,
  updated_at: '2026-01-01T00:00:00.000Z',
  topic: {
    __entity_type: 'topic' as const,
    id: 'topic-1',
    name: 'My Topic',
    slug: 'my-topic',
    markdown: '',
    topic_type: 'card',
    created_at: '2026-01-01T00:00:00.000Z',
    referral_program_id: null,
  },
}

describe('createPostDetailPage — ReviewDisputeEntry gate', () => {
  const { default: ReviewDetailPage } = createPostDetailPage('review', 'review')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getPost).mockResolvedValue(basePostResponse as never)
    vi.mocked(getPostDescendants).mockResolvedValue(emptyDescendants as never)
  })

  it('renders ReviewDisputeEntry when user is logged in and post has a reviewed topic', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'user-1', roles: [] } as never)
    vi.mocked(getPost).mockResolvedValue({
      ...basePostResponse,
      post: { ...basePost, review_topic_ratings: [baseReviewRating] },
    } as never)

    const result = await ReviewDetailPage({ params: Promise.resolve({ id: 'post-1' }) })
    render(result)
    expect(screen.getByTestId('review-dispute-entry')).toBeDefined()
  })

  it('does not render ReviewDisputeEntry when user is not logged in', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)

    const result = await ReviewDetailPage({ params: Promise.resolve({ id: 'post-1' }) })
    render(result)
    expect(screen.queryByTestId('review-dispute-entry')).toBeNull()
  })

  it('does not render ReviewDisputeEntry when post has no reviewed topic', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'user-1', roles: [] } as never)
    vi.mocked(getPost).mockResolvedValue({
      ...basePostResponse,
      post: { ...basePost, review_topic_ratings: [] },
    } as never)

    const result = await ReviewDetailPage({ params: Promise.resolve({ id: 'post-1' }) })
    render(result)
    expect(screen.queryByTestId('review-dispute-entry')).toBeNull()
  })
})
