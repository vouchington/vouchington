/* oxlint-disable no-mistakes/playwright-consistent-attribute -- moved test support preserves existing Testing Library selectors */
import type { ReactNode } from 'react'
import { vi } from 'vitest'

const { mockGetDefaultTopicSubpage, mockGetTopic, mockNotFound, mockRedirect } = vi.hoisted(() => ({
  mockGetDefaultTopicSubpage: vi.fn<VitestLooseMock>(() => 'posts'),
  mockGetTopic: vi.fn<VitestLooseMock>(),
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
      TopicRouteLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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

export { mockGetDefaultTopicSubpage, mockRedirect }
