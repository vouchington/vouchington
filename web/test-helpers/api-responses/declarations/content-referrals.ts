import nativeLandingPageItemsMutationDefault from '../../../../api-fixtures/v1/responses/native.landing-page-items-mutation.default.json'
import nativePaidUrlCrawlDefault from '../../../../api-fixtures/v1/responses/native.paid.url-crawl.default.json'
import nativePaidUrlCrawlsDefault from '../../../../api-fixtures/v1/responses/native.paid.url-crawls.default.json'
import nativeRssFeedItemDetailDefault from '../../../../api-fixtures/v1/responses/native.rss-feed-item.detail.default.json'
import nativeTopicRecommendationDetailDefault from '../../../../api-fixtures/v1/responses/native.topic-recommendation.detail.default.json'
import nativeTopicRecommendationsTopHashtagsDefault from '../../../../api-fixtures/v1/responses/native.topic-recommendations.top-hashtags.default.json'
import referralClicksMineDefault from '../../../../api-fixtures/v1/responses/web.referral-clicks.mine.default.json'
import referralLinksFeedDefault from '../../../../api-fixtures/v1/responses/web.referral-links.feed.default.json'
import referralLinksMineDefault from '../../../../api-fixtures/v1/responses/web.referral-links.mine.default.json'
import referralLinksPrioritizedDefault from '../../../../api-fixtures/v1/responses/web.referral-links.prioritized.default.json'
import rssFeedItemsFeedDefault from '../../../../api-fixtures/v1/responses/web.rss-feed-items.feed.default.json'
import swiftPodcastEpisodeChaptersDefault from '../../../../api-fixtures/v1/responses/swift.podcast-episode-chapters.default.json'
import topicsMutationDefault from '../../../../api-fixtures/v1/responses/web.topics.mutation.default.json'
import topicsPublisherTypesDefault from '../../../../api-fixtures/v1/responses/web.topics.publisher-types.default.json'
import topicsSearchDefault from '../../../../api-fixtures/v1/responses/web.topics.search.default.json'
import topicsSearchReferralProgramsDefault from '../../../../api-fixtures/v1/responses/web.topics.search.referral-programs.default.json'
import topicsUserTagsDefault from '../../../../api-fixtures/v1/responses/native.topics.user-tags.default.json'
import webAdminRssFeedCrawlDefault from '../../../../api-fixtures/v1/responses/web.admin.rss-feed-crawl.default.json'
import webPaidRssFeedCrawlDefault from '../../../../api-fixtures/v1/responses/web.paid.rss-feed-crawl.default.json'
import webPaidRssFeedCrawlsDefault from '../../../../api-fixtures/v1/responses/web.paid.rss-feed-crawls.default.json'
import trendingReferralProgramsDefault from '../../../../api-fixtures/v1/responses/web.trending-referral-programs.default.json'
import type { TopicsSearchResponseBody } from '@/lib/api/client/topics'
import type { TopHashtagsResponseBody } from '@/lib/api/client/topic-recommendations'
import type { UserTagsResponse } from '@/lib/api/server/topics'
import type {
  ListResponse,
  PostResponseBody,
  PrioritizedReferralLinksResponse,
  PublisherTypesResponseBody,
  ReferralClickLogResponseBody,
  ReferralLinkFeedResponse,
  RssFeedItemResponseBody,
  TopicMutationResponseBody,
  TrendingReferralProgramsResponseBody,
  UserReferralLinkWithDetails,
} from '@/types/api-responses'
import type { LandingPageDetailResponseBody } from '@/types/api-responses/memberships-referrals-and-admin'
import type { PodcastEpisodeChaptersResponseBody } from '@/types/podcast-episode-chapters'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

const landingPageItemsMutationFixture =
  nativeLandingPageItemsMutationDefault as unknown as LandingPageDetailResponseBody

export const CONTENT_REFERRALS_DECLARATIONS = [
  defineWebApiFixture<LandingPageDetailResponseBody>()(
    'native.landing-page-items-mutation.default',
    landingPageItemsMutationFixture,
    context =>
      context.client.my.replaceMyLandingPageItems('landing-page-1', {
        items: [
          { type: 'profile_link', profile_link_id: 'profile-link-1' },
          { type: 'review', review_id: 'review-1' },
          { type: 'referral_link', referral_link_id: 'referral-link-1' },
          {
            type: 'topic_group',
            topic_id: 'topic-1',
            entries: [
              { type: 'review', review_id: 'review-2' },
              { type: 'referral_link', referral_link_id: 'referral-link-2' },
            ],
          },
          { type: 'link', label: 'Newsletter', url: 'https://example.com/newsletter' },
        ],
      }),
  ),
  defineWebApiFixture<RssFeedItemResponseBody>()(
    'native.rss-feed-item.detail.default',
    nativeRssFeedItemDetailDefault,
    context => context.server.rssFeedItems.getRssFeedItem('00000000-0000-7000-8000-000000007886'),
  ),
  defineWebApiFixture<typeof nativePaidUrlCrawlsDefault>()(
    'native.paid.url-crawls.default',
    nativePaidUrlCrawlsDefault,
    context => context.rawServer.get('/api/v1/urls/url-1/crawls', { searchParams: { limit: 25 } }),
  ),
  defineWebApiFixture<typeof nativePaidUrlCrawlDefault>()(
    'native.paid.url-crawl.default',
    nativePaidUrlCrawlDefault,
    context => context.rawServer.get('/api/v1/urls/url-1/crawls/crawl-1'),
  ),
  defineWebApiFixture<typeof webPaidRssFeedCrawlsDefault>()(
    'web.paid.rss-feed-crawls.default',
    webPaidRssFeedCrawlsDefault,
    context =>
      context.rawServer.get('/api/v1/rss-feeds/rss-feed-1/crawls', {
        searchParams: { limit: 25 },
      }),
  ),
  defineWebApiFixture<typeof webPaidRssFeedCrawlDefault>()(
    'web.paid.rss-feed-crawl.default',
    webPaidRssFeedCrawlDefault,
    context => context.rawServer.get('/api/v1/rss-feeds/rss-feed-1/crawls/crawl-1'),
  ),
  defineWebApiFixture<typeof webAdminRssFeedCrawlDefault>()(
    'web.admin.rss-feed-crawl.default',
    webAdminRssFeedCrawlDefault,
    context => context.rawServer.get('/api/v1/rss-feeds/rss-feed-1/crawls/crawl-1'),
  ),
  defineWebApiFixture<PostResponseBody>()(
    'native.topic-recommendation.detail.default',
    nativeTopicRecommendationDetailDefault,
    context => context.server.topicRecommendations.getTopicRecommendation('recommendation-1'),
  ),
  defineWebApiFixture<TopHashtagsResponseBody>()(
    'native.topic-recommendations.top-hashtags.default',
    nativeTopicRecommendationsTopHashtagsDefault,
    context =>
      context.server.topicRecommendations.getTopHashtags({
        searchParams: { limit: 25, mapping: 'all' },
      }),
  ),
  defineWebApiFixture<UserTagsResponse>()(
    'native.topics.user-tags.default',
    topicsUserTagsDefault,
    context => context.server.topics.getUserTags(),
  ),
  defineWebApiFixture<ReferralLinkFeedResponse>()(
    'web.referral-links.feed.default',
    referralLinksFeedDefault,
    context =>
      context.server.feeds.getReferralLinksFeed('follow_users', { searchParams: { limit: 25 } }),
  ),
  defineWebApiFixture<ListResponse<UserReferralLinkWithDetails>>()(
    'web.referral-links.mine.default',
    referralLinksMineDefault,
    context => context.client.referralLinks.getMyReferralLinksClient(),
    [context => context.server.referralLinks.getAllMyReferralLinks()],
  ),
  defineWebApiFixture<PrioritizedReferralLinksResponse>()(
    'web.referral-links.prioritized.default',
    referralLinksPrioritizedDefault,
    context => context.client.referralLinks.getAllReferralLinks('referral-program-1'),
  ),
  defineWebApiFixture<ReferralClickLogResponseBody>()(
    'web.referral-clicks.mine.default',
    referralClicksMineDefault,
    context => context.client.referralClicks.getMyReferralClicksClient(),
    [context => context.server.my.getMyReferralClicks()],
  ),
  defineWebApiFixture<RssFeedItemsFeedResponseBody>()(
    'web.rss-feed-items.feed.default',
    rssFeedItemsFeedDefault,
    context =>
      context.server.feeds.getRssFeedItemsFeed('any', {
        searchParams: { limit: 25, media_type: 'article' },
      }),
  ),
  defineWebApiFixture<TopicMutationResponseBody>()(
    'web.topics.mutation.default',
    topicsMutationDefault,
    context =>
      context.client.topics.createTopic({ name: 'Tech', slug: 'tech', topic_type: 'topic' }),
  ),
  defineWebApiFixture<PublisherTypesResponseBody>()(
    'web.topics.publisher-types.default',
    topicsPublisherTypesDefault,
    context => context.server.topics.getPublisherTypes(),
  ),
  defineWebApiFixture<TopicsSearchResponseBody>()(
    'web.topics.search.default',
    topicsSearchDefault,
    context => context.client.topics.fetchTopics({ q: 'tech' }),
    [context => context.server.topics.getTopics({ searchParams: { q: 'tech' } })],
  ),
  defineWebApiFixture<TopicsSearchResponseBody>()(
    'web.topics.search.referral-programs.default',
    topicsSearchReferralProgramsDefault,
    context =>
      context.client.topics.fetchTopics({
        q: 'test',
        topic_types: ['referral_program'],
        limit: 10,
      }),
    [
      context =>
        context.server.topics.getTopics({
          searchParams: { q: 'test', topic_types: 'referral_program', limit: 10 },
        }),
    ],
  ),
  defineWebApiFixture<TrendingReferralProgramsResponseBody>()(
    'web.trending-referral-programs.default',
    trendingReferralProgramsDefault,
    context =>
      context.server.trendingReferralPrograms.getTrendingReferralProgramsEndpoint({
        searchParams: { limit: 10 },
      }),
  ),
  defineWebApiFixture<PodcastEpisodeChaptersResponseBody>()(
    'swift.podcast-episode-chapters.default',
    swiftPodcastEpisodeChaptersDefault,
    context => context.client.podcastEpisodeChapters.fetchPodcastEpisodeChapters('episode-1'),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
