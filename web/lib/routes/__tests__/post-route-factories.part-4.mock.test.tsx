import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetPostAncestors, mockGetPostDescendants, mockNotFound } = vi.hoisted(() => ({
  mockGetPostAncestors: vi.fn<VitestLooseMock>(),
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
  getPostAncestors: mockGetPostAncestors,
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
vi.mock(import('@/lib/post-helpers'), () => ({
  getPostPath: vi.fn<VitestLooseMock>(
    (_slug: string, post: { slug?: string; id: string }) => `/${_slug}/${post.slug ?? post.id}`,
  ),
}))
vi.mock(import('@/lib/links/entity-href'), () => ({
  communityHref: vi.fn<VitestLooseMock>(
    (community: { slug: string }) => `/communities/${community.slug}`,
  ),
  createUserPathname: vi.fn<VitestLooseMock>(() => '/user/test'),
}))
vi.mock(import('@/lib/permissions/can-see-downvotes'), () => ({
  canCurrentUserSeeDownvotes: vi.fn<VitestLooseMock>(() => true),
}))
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
vi.mock(
  import('@/components/ui/breadcrumb'),
  () =>
    ({
      Breadcrumbs: () => null,
    }) as unknown as typeof import('@/components/ui/breadcrumb'),
)

import { render, screen } from '@testing-library/react'
import { createCommentPermalinkPage } from '../post-comment-factories'
import { getPostAncestors, getPostDescendants } from '@/lib/api/server'
import { createPageMetadata } from '@/lib/seo/metadata'

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

const emptyDescendants = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  posts: {},
  posts_metrics: {},
}

describe('createCommentPermalinkPage', () => {
  const { default: CommentPage, generateMetadata } = createCommentPermalinkPage('review', 'review')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getPostDescendants).mockResolvedValue(emptyDescendants as never)
  })

  it('calls notFound when getPostAncestors returns null', async () => {
    vi.mocked(getPostAncestors).mockResolvedValue(null as never)
    await expect(
      CommentPage({ params: Promise.resolve({ id: 'post-1', commentId: 'c-1' }) }),
    ).rejects.toThrow('notFound')
  })

  it('calls notFound when there is no root post', async () => {
    vi.mocked(getPostAncestors).mockResolvedValue({
      ...emptyDescendants,
      results: [],
    } as never)
    await expect(
      CommentPage({ params: Promise.resolve({ id: 'post-1', commentId: 'c-1' }) }),
    ).rejects.toThrow('notFound')
  })

  it('renders CommentPermalink when ancestors exist with matching post type', async () => {
    vi.mocked(getPostAncestors).mockResolvedValue({
      ...emptyDescendants,
      results: [{ id: 'post-1' }],
      posts: { 'post-1': basePost },
    } as never)
    const result = await CommentPage({
      params: Promise.resolve({ id: 'post-1', commentId: 'c-1' }),
    })
    render(result)
    expect(screen.getByTestId('comment-permalink')).toBeDefined()
  })

  it('passes the target comment content language to createPageMetadata', async () => {
    vi.mocked(getPostAncestors).mockResolvedValue({
      ...emptyDescendants,
      results: [{ id: 'post-1' }],
      posts: {
        'post-1': basePost,
        'c-1': { ...basePost, id: 'c-1', declared_language: 'fr' },
      },
    } as never)

    await generateMetadata({ params: Promise.resolve({ id: 'post-1', commentId: 'c-1' }) })

    expect(createPageMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ contentLanguage: 'fr' }),
    )
  })

  it('marks comment permalinks on archived posts as noindex', async () => {
    vi.mocked(getPostAncestors).mockResolvedValue({
      ...emptyDescendants,
      results: [{ id: 'post-1' }],
      posts: {
        'post-1': { ...basePost, archived_at: '2026-09-05T00:00:00.000Z' },
        'c-1': { ...basePost, id: 'c-1' },
      },
      post_elections: {
        'post-1': { votes_count_up: 2, votes_count_down: 1 },
      },
    } as never)

    await generateMetadata({ params: Promise.resolve({ id: 'post-1', commentId: 'c-1' }) })

    expect(createPageMetadata).toHaveBeenCalledWith(expect.objectContaining({ noIndex: true }))
  })
})
