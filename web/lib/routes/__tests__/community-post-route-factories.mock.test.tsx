import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'
import type { MessageKey } from '@ts-shared/ui-messages'

const {
  mockGetPost,
  mockGetPostAncestors,
  mockGetPostDescendants,
  mockGetCommunity,
  mockGetCommunityPinnedPosts,
  mockNotFound,
} = vi.hoisted(() => ({
  mockGetPost: vi.fn<VitestLooseMock>(),
  mockGetPostAncestors: vi.fn<VitestLooseMock>(),
  mockGetPostDescendants: vi.fn<VitestLooseMock>(),
  mockGetCommunity: vi.fn<VitestLooseMock>(() => Promise.resolve(null)),
  mockGetCommunityPinnedPosts: vi.fn<VitestLooseMock>(() => Promise.resolve({ pinned_posts: [] })),
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
  getPostAncestors: mockGetPostAncestors,
  getPostDescendants: mockGetPostDescendants,
  getCommunity: mockGetCommunity,
  getCommunityPinnedPosts: mockGetCommunityPinnedPosts,
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
  userHref: vi.fn<VitestLooseMock>(() => '/user/test'),
}))
vi.mock(import('@/lib/permissions/can-see-downvotes'), () => ({
  canCurrentUserSeeDownvotes: vi.fn<VitestLooseMock>(() => true),
}))
vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
vi.mock(import('@/components/comments/comment-permalink'), () => ({
  CommentPermalink: () => <div data-testid='comment-permalink' />,
}))
vi.mock(
  import('@/components/seo/anonymous-structured-data-script'),
  () =>
    ({
      AnonymousStructuredDataScript: () => null,
    }) as unknown as typeof import('@/components/seo/anonymous-structured-data-script'),
)
vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: ({
    items,
  }: {
    items: Array<{ name?: string; nameKey?: MessageKey; path: string }>
  }) => (
    <nav data-testid='breadcrumbs'>
      {items
        .map(i => `${i.name ?? (i.nameKey ? defaultTranslator(i.nameKey) : '')}@${i.path}`)
        .join('|')}
    </nav>
  ),
}))
vi.mock(import('@/types/topics'), () => ({
  getTopicTypeSlug: vi.fn<VitestLooseMock>(() => 'topic'),
}))

import { render, screen } from '@testing-library/react'
import { createCommentPermalinkPage } from '../post-comment-factories'
import { createPostDetailPage } from '../post-route-factories'
import { getPost, getPostAncestors, getPostDescendants } from '@/lib/api/server'

const basePost = {
  id: 'post-1',
  title: 'Test Review',
  slug: 'test-review',
  post_type: 'review' as const,
  markdown: 'content',
  privacy: 'public' as const,
  broadcast: 'everyone' as const,
  archived_at: null,
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
  post_metrics: null,
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
  post_elections: {},
  markdown_to_html: {},
}

describe('community post route breadcrumbs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getPost).mockResolvedValue(basePostResponse as never)
    vi.mocked(getPostDescendants).mockResolvedValue(emptyDescendants as never)
    vi.mocked(getPostAncestors).mockResolvedValue(emptyDescendants as never)
  })

  it('uses the community breadcrumb and passes community data for community posts', async () => {
    const { default: ReviewDetailPage } = createPostDetailPage('review', 'review')
    vi.mocked(getPost).mockResolvedValue({
      ...basePostResponse,
      post: {
        ...basePost,
        community_id: 'community-1',
        post_related_topics: [
          {
            id: 'topic-1',
            name: 'Topic Breadcrumb',
            slug: 'topic-breadcrumb',
            topic_type: 'topic',
            referral_program_id: null,
          },
        ],
      },
      communities: {
        'community-1': { id: 'community-1', name: 'Rewards Club', slug: 'rewards-club' },
      },
    } as never)

    const result = await ReviewDetailPage({ params: Promise.resolve({ id: 'post-1' }) })
    render(result)

    const breadcrumbs = screen.getByTestId('breadcrumbs')
    expect(breadcrumbs.textContent).toBe(
      'Home@/|Rewards Club@/communities/rewards-club|Reviews@/reviews|Test Review@/review/test-review',
    )
    expect(breadcrumbs.textContent).not.toContain('Topic Breadcrumb')
    expect(screen.getByTestId('post-detail').getAttribute('data-community-name')).toBe(
      'Rewards Club',
    )
  })

  it('uses the community breadcrumb for community comment permalinks', async () => {
    const { default: CommentPage } = createCommentPermalinkPage('review', 'review')
    vi.mocked(getPostAncestors).mockResolvedValue({
      ...emptyDescendants,
      results: [{ id: 'post-1' }, { id: 'comment-1' }],
      posts: {
        'post-1': { ...basePost, community_id: 'community-1' },
        'comment-1': {
          ...basePost,
          id: 'comment-1',
          post_type: 'comment',
          title: '',
          root_id: 'post-1',
          parent_id: 'post-1',
          community_id: 'community-1',
        },
      },
      communities: {
        'community-1': { id: 'community-1', name: 'Rewards Club', slug: 'rewards-club' },
      },
    } as never)

    const result = await CommentPage({
      params: Promise.resolve({ id: 'post-1', commentId: 'comment-1' }),
    })
    render(result)

    expect(screen.getByTestId('breadcrumbs').textContent).toBe(
      'Home@/|Rewards Club@/communities/rewards-club|Test Review@/review/test-review|Comment@/review/test-review/comment/comment-1',
    )
  })
})
