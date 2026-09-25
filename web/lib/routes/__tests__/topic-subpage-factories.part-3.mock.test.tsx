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

import { createTopicDiscussionsPage } from '../topic-navigation-factories'

import { createTopicReferralLinksPage } from '../topic-referral-factories'

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

  describe('createTopicReferralLinksPage', () => {
    const { default: ReferralLinksPage } = createTopicReferralLinksPage('referral-program')

    it('calls notFound when topic has no referral program', async () => {
      vi.mocked(getTopic).mockResolvedValue({
        ...baseTopicData,
        topic: { ...baseTopic, topic_type: 'topic' as const, referral_program_id: null },
      } as never)

      await expect(
        ReferralLinksPage({ params: Promise.resolve({ id: 'topic-1' }) }),
      ).rejects.toThrow('notFound')
    })

    it('calls notFound when topic is not found', async () => {
      vi.mocked(getTopic).mockResolvedValue(null)

      await expect(
        ReferralLinksPage({ params: Promise.resolve({ id: 'missing' }) }),
      ).rejects.toThrow('notFound')
    })

    it('renders referral links page for a referral_program topic', async () => {
      vi.mocked(getTopic).mockResolvedValue({
        ...baseTopicData,
        topic: { ...baseTopic, topic_type: 'referral_program' as const },
      } as never)

      const result = await ReferralLinksPage({ params: Promise.resolve({ id: 'topic-1' }) })
      render(result)
      expect(screen.getByText('Referral Links')).toBeDefined()
    })
  })

  describe('createTopicDiscussionsPage', () => {
    const { default: DiscussionsPage } = createTopicDiscussionsPage('topic')

    it('redirects to /posts subpage', async () => {
      await expect(DiscussionsPage({ params: Promise.resolve({ id: 'topic-1' }) })).rejects.toThrow(
        'redirect',
      )
      expect(mockRedirect).toHaveBeenCalledWith('/topic/topic-1/posts')
    })
  })
})
