import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetTopic, mockGetDefaultTopicSubpage, mockNotFound, mockRedirect } = vi.hoisted(() => ({
  mockGetTopic: vi.fn<VitestLooseMock>(),
  mockGetDefaultTopicSubpage: vi.fn<VitestLooseMock>(() => 'posts'),
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
  getTopic: mockGetTopic,
  getPrioritizedReferralLinks: vi.fn<VitestLooseMock>(() => Promise.resolve({ results: [] })),
  getMyReferralLinks: vi.fn<VitestLooseMock>(() => Promise.resolve(null)),
  getReferralProgramValidationInfo: vi.fn<VitestLooseMock>(() => Promise.resolve(null)),
  getOfficialReferralLinks: vi.fn<VitestLooseMock>(() =>
    Promise.resolve({ official_referral_links: [] }),
  ),
}))

vi.mock(import('@/lib/topic-default-subpage'), () => ({
  getDefaultTopicSubpage: mockGetDefaultTopicSubpage,
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({ noIndex: true })),
  createPageMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

vi.mock(import('@/lib/seo/topic-pages'), () => ({
  createTopicSectionMetadata: vi.fn<VitestLooseMock>(() => ({})),
  createTopicSectionStructuredData: vi.fn<VitestLooseMock>(() => ({
    topic: {},
    breadcrumbs: {},
  })),
  createTopicReviewSectionStructuredData: vi.fn<VitestLooseMock>(() => ({
    topic: {},
    breadcrumbs: {},
  })),
}))

vi.mock(import('@/lib/seo/posts-rss-url'), () => ({
  buildTopicPostsRssUrl: vi.fn<VitestLooseMock>(() => '/rss/posts'),
}))

vi.mock(
  import('@/components/topics/topic-route-layout'),
  () =>
    ({
      TopicRouteLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    }) as unknown as typeof import('@/components/topics/topic-route-layout'),
)

vi.mock(
  import('@/components/seo/anonymous-structured-data-script'),
  () =>
    ({
      AnonymousStructuredDataScript: () => null,
    }) as unknown as typeof import('@/components/seo/anonymous-structured-data-script'),
)

vi.mock(
  import('@/components/topics/topic-posts-page'),
  () =>
    ({
      TopicPostsPage: () => <div data-testid='topic-posts-page' />,
    }) as unknown as typeof import('@/components/topics/topic-posts-page'),
)

vi.mock(
  import('@/components/topics/topic-reviews-page'),
  () =>
    ({
      TopicReviewsPage: () => <div data-testid='topic-reviews-page' />,
    }) as unknown as typeof import('@/components/topics/topic-reviews-page'),
)

vi.mock(
  import('@/components/topics/topic-data-points-page'),
  () =>
    ({
      TopicDataPointsPage: () => <div data-testid='topic-data-points-page' />,
    }) as unknown as typeof import('@/components/topics/topic-data-points-page'),
)

vi.mock(
  import('@/components/topics/topic-latest-page'),
  () =>
    ({
      TopicLatestPage: () => <div data-testid='topic-latest-page' />,
    }) as unknown as typeof import('@/components/topics/topic-latest-page'),
)

vi.mock(
  import('@/components/topics/topic-news-page'),
  () =>
    ({
      TopicNewsPage: () => <div data-testid='topic-news-page' />,
    }) as unknown as typeof import('@/components/topics/topic-news-page'),
)

vi.mock(
  import('@/components/referral-links/referral-link-form'),
  () =>
    ({
      ReferralLinkForm: () => null,
    }) as unknown as typeof import('@/components/referral-links/referral-link-form'),
)

vi.mock(
  import('@/components/referral-links/referral-link-list'),
  () =>
    ({
      ReferralLinkList: () => null,
    }) as unknown as typeof import('@/components/referral-links/referral-link-list'),
)

vi.mock(
  import('@/components/referral-links/referral-links-show-all'),
  () =>
    ({
      ReferralLinksShowAll: () => null,
    }) as unknown as typeof import('@/components/referral-links/referral-links-show-all'),
)

import { render, screen } from '@testing-library/react'

import { createTopicLayout } from '../topic-layout-factory'

import { createTopicRootPage, createTopicPostsPage } from '../topic-subpage-factories'

import { getTopic } from '@/lib/api/server'

const baseTopic = {
  __entity_type: 'topic' as const,
  id: 'topic-1',
  name: 'Test Topic',
  slug: 'test-topic',
  topic_type: 'topic' as const,
  noindex: false,
  allow_reviews: true,
  markdown: '',
  aliases: [],
  created_at: '2026-01-01T00:00:00.000Z',
  hostname_id: null,
  hostname: null,
  logo_image_id: null,
  hero_image_id: null,
  rewards_program_id: null,
  referral_program_id: null,
  created_by: { id: 'u1', display_name: null, display_name_url_id: null },
  updated_by: { id: 'u1', display_name: null, display_name_url_id: null },
}

const baseTopicData = {
  topic: baseTopic,
  topic_metrics: null,
  topic_categories: [],
  html: null,
  topic_content_update: null,
}

describe('topic factory functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getTopic).mockResolvedValue(baseTopicData as never)
  })

  describe('createTopicLayout', () => {
    it('renders TopicRouteLayout with the closed-over topicType', async () => {
      const Layout = createTopicLayout('topic')
      const result = await Layout({
        params: Promise.resolve({ id: 'topic-1' }),
        children: <span data-testid='child' />,
      })
      render(result)
      expect(screen.getByTestId('child')).toBeDefined()
    })
  })

  describe('createTopicRootPage', () => {
    const { default: RootPage } = createTopicRootPage('topic')

    it('redirects to default subpage when topic is found', async () => {
      mockGetDefaultTopicSubpage.mockReturnValue('posts')

      await expect(RootPage({ params: Promise.resolve({ id: 'topic-1' }) })).rejects.toThrow(
        'redirect',
      )
      expect(mockRedirect).toHaveBeenCalledWith('/topic/topic-1/posts')
    })

    it('calls notFound when topic is not found', async () => {
      vi.mocked(getTopic).mockResolvedValue(null)

      await expect(RootPage({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow(
        'notFound',
      )
    })
  })

  describe('createTopicPostsPage', () => {
    const { default: PostsPage } = createTopicPostsPage('topic')

    it('renders TopicPostsPage when topic exists', async () => {
      const result = await PostsPage({
        params: Promise.resolve({ id: 'topic-1' }),
        searchParams: Promise.resolve({}),
      })
      render(result)
      expect(screen.getByTestId('topic-posts-page')).toBeDefined()
    })

    it('calls notFound when topic is not found', async () => {
      vi.mocked(getTopic).mockResolvedValue(null)

      await expect(
        PostsPage({
          params: Promise.resolve({ id: 'missing' }),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow('notFound')
    })
  })
})
