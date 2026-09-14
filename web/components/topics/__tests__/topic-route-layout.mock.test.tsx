import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopicRouteLayout } from '../topic-route-layout'
import { getTopic } from '@/lib/api/server'
import { getRssFeeds } from '@/lib/api/server/rss-feeds'
import { getHostnames } from '@/lib/api/server/hostnames'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { headers } from 'next/headers'
import { notFound, permanentRedirect } from 'next/navigation'
import {
  emptyHostnames,
  emptyRssFeeds,
  makeRssFeed,
  makeTopicData,
} from '../../../test-helpers/components/topics/topic-route-layout-fixtures'
vi.mock(import('@/lib/api/server'), () => ({ getTopic: vi.fn<VitestLooseMock>() }))
vi.mock(import('@/lib/api/server/rss-feeds'), () => ({ getRssFeeds: vi.fn<VitestLooseMock>() }))
vi.mock(import('@/lib/api/server/hostnames'), () => ({ getHostnames: vi.fn<VitestLooseMock>() }))
vi.mock(import('@/lib/api/server/fediverse'), () => ({
  getFediverseInstance: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: vi.fn<VitestLooseMock>() }))
vi.mock(import('next/headers'), () => ({ headers: vi.fn<VitestLooseMock>() }))
vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: vi.fn<VitestLooseMock>(() => {
        throw new Error('notFound')
      }),
      permanentRedirect: vi.fn<VitestLooseMock>((href: string) => {
        throw new Error(`redirect:${href}`)
      }),
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(
  import('../topic-actions-aside'),
  () => ({ TopicActionsAside: () => null }) as unknown as typeof import('../topic-actions-aside'),
)
vi.mock(import('@/components/shared/follow-button'), () => ({ FollowButton: () => null }))
vi.mock(
  import('@/components/shared/entity-bookmark-button'),
  () =>
    ({
      EntityBookmarkButton: () => null,
    }) as unknown as typeof import('@/components/shared/entity-bookmark-button'),
)
vi.mock(
  import('@/lib/navigation/intents/nav-intent-provider'),
  () =>
    ({
      SetNavIntent: ({ intent }: { intent: string }) => (
        <div
          data-testid='set-nav-intent'
          data-intent={intent}
        />
      ),
    }) as unknown as typeof import('@/lib/navigation/intents/nav-intent-provider'),
)
vi.mock(import('../topic-detail-layout'), () => ({
  TopicDetailLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='topic-detail-layout'>{children}</div>
  ),
}))
vi.mock(
  import('../topic-follow-context'),
  () => ({ default: () => null }) as unknown as typeof import('../topic-follow-context'),
)
vi.mock(
  import('@/components/referral-cta-aside'),
  () =>
    ({
      ReferralCtaAside: () => null,
    }) as unknown as typeof import('@/components/referral-cta-aside'),
)
vi.mock(
  import('../topic-sources-aside'),
  () => ({ TopicSourcesAside: () => null }) as unknown as typeof import('../topic-sources-aside'),
)
vi.mock(import('../topic-description-aside'), () => ({
  TopicDescriptionAside: ({ contentLanguage }: { contentLanguage?: string | null }) => (
    <div data-testid='topic-description-aside-language'>{contentLanguage ?? ''}</div>
  ),
}))
vi.mock(import('@/components/asides/sequential-aside-suspense'), () => ({
  SequentialAsideSuspense: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='sequential-aside-suspense'>{children}</div>
  ),
}))
vi.mock(
  import('@/components/tags/topic-related-topics-aside'),
  () =>
    ({
      TopicRelatedTopicsAside: () => null,
    }) as unknown as typeof import('@/components/tags/topic-related-topics-aside'),
)
vi.mock(
  import('../topic-communities-aside'),
  () =>
    ({
      TopicCommunitiesAside: () => null,
    }) as unknown as typeof import('../topic-communities-aside'),
)
vi.mock(
  import('@/components/tags/topic-faq-posts-aside'),
  () =>
    ({
      TopicFaqPostsAside: () => null,
    }) as unknown as typeof import('@/components/tags/topic-faq-posts-aside'),
)
vi.mock(
  import('@/components/tags/topic-publisher-types-aside'),
  () =>
    ({
      TopicPublisherTypesAside: () => null,
    }) as unknown as typeof import('@/components/tags/topic-publisher-types-aside'),
)
vi.mock(
  import('@/components/tags/topic-category-tags-aside'),
  () =>
    ({
      TopicCategoryTagsAside: () => null,
    }) as unknown as typeof import('@/components/tags/topic-category-tags-aside'),
)
vi.mock(
  import('@/components/tags/topic-url-tag-aside'),
  () =>
    ({
      TopicUrlTagAside: () => null,
    }) as unknown as typeof import('@/components/tags/topic-url-tag-aside'),
)
vi.mock(
  import('@/components/referral-links/referral-links-aside'),
  () =>
    ({
      ReferralLinksAside: () => null,
    }) as unknown as typeof import('@/components/referral-links/referral-links-aside'),
)
vi.mock(import('@/components/referral-links/referral-links-aside-wrapper'), () => ({
  ReferralLinksAsideWrapper: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='referral-links-aside-wrapper'>{children}</div>
  ),
}))
vi.mock(
  import('@/components/podcasts/podcast-show-metadata-aside'),
  () =>
    ({
      PodcastShowMetadataAside: () => null,
    }) as unknown as typeof import('@/components/podcasts/podcast-show-metadata-aside'),
)
vi.mock(import('@/components/sources/rss-feed-view-tracker'), () => ({
  RssFeedViewTracker: () => null,
}))
vi.mock(
  import('@/components/page-with-aside'),
  () =>
    ({
      PageWithAside: ({
        children,
        aside,
      }: {
        children: React.ReactNode
        aside: React.ReactNode
      }) => (
        <div>
          <div data-testid='aside'>{aside}</div>
          <div data-testid='main'>{children}</div>
        </div>
      ),
    }) as unknown as typeof import('@/components/page-with-aside'),
)
const mockGetTopic = vi.mocked(getTopic)
const mockGetRssFeeds = vi.mocked(getRssFeeds)
const mockGetHostnames = vi.mocked(getHostnames)
const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockHeaders = vi.mocked(headers)
const mockNotFound = vi.mocked(notFound)
const mockPermanentRedirect = vi.mocked(permanentRedirect)
describe('TopicRouteLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHeaders.mockResolvedValue(new Headers({ 'x-pathname': '/topic/source-topic/posts' }))
    mockGetCurrentUser.mockResolvedValue(null)
    mockGetHostnames.mockResolvedValue(emptyHostnames as Awaited<ReturnType<typeof getHostnames>>)
  })
  it('redirects merged source routes before topic-type checks and preserves nested suffixes', async () => {
    mockGetTopic.mockResolvedValue({
      topic: { id: 'destination-topic-id', slug: 'destination-topic', topic_type: 'card' },
      topic_redirect: {
        source_topic_id: 'source-topic-id',
        source_topic_slug: 'source-topic',
        source_topic_type: 'topic',
        destination_topic_id: 'destination-topic-id',
      },
    } as Awaited<ReturnType<typeof getTopic>>)
    await expect(
      TopicRouteLayout({ id: 'source-topic', topicType: 'topic', children: <div /> }),
    ).rejects.toThrow('redirect:/card/destination-topic/posts')
    expect(mockPermanentRedirect).toHaveBeenCalledWith('/card/destination-topic/posts')
    expect(mockNotFound).not.toHaveBeenCalled()
  })
  it('preserves query strings when redirecting merged source routes', async () => {
    mockHeaders.mockResolvedValue(
      new Headers({ 'x-pathname': '/topic/source-topic/posts', 'x-search': 'after=cursor-1' }),
    )
    mockGetTopic.mockResolvedValue({
      topic: { id: 'destination-topic-id', slug: 'destination-topic', topic_type: 'topic' },
      topic_redirect: {
        source_topic_id: 'source-topic-id',
        source_topic_slug: 'source-topic',
        source_topic_type: 'topic',
        destination_topic_id: 'destination-topic-id',
      },
    } as Awaited<ReturnType<typeof getTopic>>)
    await expect(
      TopicRouteLayout({ id: 'source-topic', topicType: 'topic', children: <div /> }),
    ).rejects.toThrow('redirect:/topic/destination-topic/posts?after=cursor-1')
    expect(mockPermanentRedirect).toHaveBeenCalledWith(
      '/topic/destination-topic/posts?after=cursor-1',
    )
  })
})
describe('TopicRouteLayout breadcrumbs and SetNavIntent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHeaders.mockResolvedValue(new Headers({ 'x-pathname': '/source/level1techs/latest' }))
    mockGetCurrentUser.mockResolvedValue(null)
    mockGetHostnames.mockResolvedValue(emptyHostnames as Awaited<ReturnType<typeof getHostnames>>)
    mockGetTopic.mockResolvedValue(
      makeTopicData('rss_feed') as unknown as Awaited<ReturnType<typeof getTopic>>,
    )
  })
  it.each([
    ['video', 'Channels', 'videos'],
    ['podcast', 'Podcasts', 'podcasts'],
    ['article', 'News Sources', 'news'],
    ['mixed', 'Sources', 'web-search'],
  ] as const)(
    'rss_feed feed_type=%s → breadcrumb=%s, intent=%s',
    async (feedType, label, intent) => {
      mockGetRssFeeds.mockResolvedValue(
        makeRssFeed(feedType) as Awaited<ReturnType<typeof getRssFeeds>>,
      )
      const jsx = await TopicRouteLayout({
        id: 'level1techs',
        topicType: 'rss_feed',
        children: <div />,
      })
      render(jsx)
      expect(screen.getByText(label)).toBeDefined()
      expect(screen.getByTestId('set-nav-intent').getAttribute('data-intent')).toBe(intent)
    },
  )
  it('rss_feed with no feeds → News Sources breadcrumb and news intent (null baseline)', async () => {
    mockGetRssFeeds.mockResolvedValue(emptyRssFeeds as Awaited<ReturnType<typeof getRssFeeds>>)
    const jsx = await TopicRouteLayout({
      id: 'level1techs',
      topicType: 'rss_feed',
      children: <div />,
    })
    render(jsx)
    expect(screen.getByText('News Sources')).toBeDefined()
    expect(screen.getByTestId('set-nav-intent').getAttribute('data-intent')).toBe('news')
  })
  it('passes the topic detected language to the description aside', async () => {
    mockGetRssFeeds.mockResolvedValue(emptyRssFeeds as Awaited<ReturnType<typeof getRssFeeds>>)
    const jsx = await TopicRouteLayout({
      id: 'level1techs',
      topicType: 'rss_feed',
      children: <div />,
    })
    render(jsx)
    expect(screen.getByTestId('topic-description-aside-language')).toHaveTextContent('fr')
  })
  it('passes empty content language when the topic has no detected language', async () => {
    const topicData = makeTopicData('rss_feed')
    mockGetTopic.mockResolvedValue({
      ...topicData,
      topic: { ...topicData.topic, lingua_rs_detected_language: null },
    } as unknown as Awaited<ReturnType<typeof getTopic>>)
    mockGetRssFeeds.mockResolvedValue(emptyRssFeeds as Awaited<ReturnType<typeof getRssFeeds>>)
    const jsx = await TopicRouteLayout({
      id: 'level1techs',
      topicType: 'rss_feed',
      children: <div />,
    })
    render(jsx)
    expect(screen.getByTestId('topic-description-aside-language')).toHaveTextContent('')
  })
  it('non-rss_feed topic_type uses type-based breadcrumb, no SetNavIntent', async () => {
    mockGetTopic.mockResolvedValue(
      makeTopicData('topic') as unknown as Awaited<ReturnType<typeof getTopic>>,
    )
    mockGetRssFeeds.mockResolvedValue(emptyRssFeeds as Awaited<ReturnType<typeof getRssFeeds>>)
    const jsx = await TopicRouteLayout({ id: 'level1techs', topicType: 'topic', children: <div /> })
    render(jsx)
    expect(screen.getByText('Topics')).toBeDefined()
    expect(screen.queryByTestId('set-nav-intent')).toBeNull()
  })
})
