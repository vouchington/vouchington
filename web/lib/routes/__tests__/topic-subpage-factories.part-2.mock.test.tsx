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

import {
  createTopicRootPage,
  createTopicPostsPage,
  createTopicReviewsPage,
  createTopicDataPointsPage,
} from '../topic-subpage-factories'

import {
  createTopicLatestPage,
  createTopicNewsPage,
  createTopicDiscussionsPage,
} from '../topic-navigation-factories'

import { createTopicReferralLinksPage } from '../topic-referral-factories'

import { getTopic } from '@/lib/api/server'

import { createNoIndexMetadata } from '@/lib/seo/metadata'

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

  describe('createTopicReviewsPage', () => {
    const { default: ReviewsPage, generateMetadata } = createTopicReviewsPage('topic')

    it('renders TopicReviewsPage when topic allows reviews', async () => {
      const result = await ReviewsPage({
        params: Promise.resolve({ id: 'topic-1' }),
        searchParams: Promise.resolve({}),
      })
      render(result)
      expect(screen.getByTestId('topic-reviews-page')).toBeDefined()
    })

    it('calls notFound when reviews are not allowed', async () => {
      vi.mocked(getTopic).mockResolvedValue({
        ...baseTopicData,
        topic: { ...baseTopic, allow_reviews: false },
      } as never)

      await expect(
        ReviewsPage({
          params: Promise.resolve({ id: 'topic-1' }),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow('notFound')
    })

    it('returns noindex metadata when reviews are not allowed', async () => {
      vi.mocked(getTopic).mockResolvedValue({
        ...baseTopicData,
        topic: { ...baseTopic, allow_reviews: false },
      } as never)

      const metadata = await generateMetadata({ params: Promise.resolve({ id: 'topic-1' }) })
      expect(createNoIndexMetadata).toHaveBeenCalled()
      expect(metadata).toEqual({ noIndex: true })
    })

    // noindex is applied centrally in createTopicSectionMetadata (mocked here);
    // see web/lib/seo/__tests__/topic-pages.test.ts for that coverage.

    it('returns section metadata when the topic is indexable and reviewable', async () => {
      const metadata = await generateMetadata({ params: Promise.resolve({ id: 'topic-1' }) })
      expect(createNoIndexMetadata).not.toHaveBeenCalled()
      expect(metadata).toEqual({})
    })
  })

  describe('createTopicDataPointsPage', () => {
    const { default: DataPointsPage } = createTopicDataPointsPage('topic')

    it('renders TopicDataPointsPage when topic exists', async () => {
      const result = await DataPointsPage({
        params: Promise.resolve({ id: 'topic-1' }),
        searchParams: Promise.resolve({}),
      })
      render(result)
      expect(screen.getByTestId('topic-data-points-page')).toBeDefined()
    })
  })

  describe('createTopicLatestPage', () => {
    const { default: LatestPage } = createTopicLatestPage('topic')

    it('renders TopicLatestPage when topic exists', async () => {
      const result = await LatestPage({
        params: Promise.resolve({ id: 'topic-1' }),
        searchParams: Promise.resolve({}),
      })
      render(result)
      expect(screen.getByTestId('topic-latest-page')).toBeDefined()
    })
  })

  describe('createTopicNewsPage', () => {
    const { default: NewsPage } = createTopicNewsPage('topic')

    it('renders TopicNewsPage when topic exists', async () => {
      const result = await NewsPage({
        params: Promise.resolve({ id: 'topic-1' }),
        searchParams: Promise.resolve({}),
      })
      render(result)
      expect(screen.getByTestId('topic-news-page')).toBeDefined()
    })
  })
})
