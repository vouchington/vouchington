import communitiesBansDefault from '../../../../api-fixtures/v1/responses/web.communities.bans.default.json'
import communitiesListItemsCountsDefault from '../../../../api-fixtures/v1/responses/web.communities.list-items.counts.default.json'
import communitiesListItemsDomainsDefault from '../../../../api-fixtures/v1/responses/web.communities.list-items.domains.default.json'
import communitiesListItemsPostsDefault from '../../../../api-fixtures/v1/responses/web.communities.list-items.posts.default.json'
import communitiesListItemsRssFeedsDefault from '../../../../api-fixtures/v1/responses/web.communities.list-items.rss-feeds.default.json'
import communitiesListItemsTopicsDefault from '../../../../api-fixtures/v1/responses/web.communities.list-items.topics.default.json'
import communitiesListItemsUrlsDefault from '../../../../api-fixtures/v1/responses/web.communities.list-items.urls.default.json'
import communitiesModerationAnalyticsDefault from '../../../../api-fixtures/v1/responses/web.communities.moderation-analytics.default.json'
import communitiesModerationQueueDefault from '../../../../api-fixtures/v1/responses/web.communities.moderation-queue.default.json'
import communitiesModeratorStatsDefault from '../../../../api-fixtures/v1/responses/web.communities.moderator-stats.default.json'
import communitiesModeratorVacationDefault from '../../../../api-fixtures/v1/responses/web.communities.moderator-vacation.default.json'
import communitiesModlogDefault from '../../../../api-fixtures/v1/responses/web.communities.modlog.default.json'
import communitiesModmailDefault from '../../../../api-fixtures/v1/responses/web.communities.modmail.default.json'
import communitiesModmailMessagesDefault from '../../../../api-fixtures/v1/responses/web.communities.modmail-messages.default.json'
import communitiesRestrictionsDefault from '../../../../api-fixtures/v1/responses/web.communities.restrictions.default.json'
import type {
  ModmailInboxResponseBody,
  ModmailMessagesResponseBody,
} from '@/lib/api/client/modmail'
import type {
  CommunityBansResponseBody,
  CommunityListDomainsResponseBody,
  CommunityListItemCountsResponseBody,
  CommunityListPostsResponseBody,
  CommunityListRssFeedsResponseBody,
  CommunityListTopicsResponseBody,
  CommunityListUrlsResponseBody,
  CommunityModerationQueueResponseBody,
  CommunityModeratorStatsResponseBody,
  CommunityRestrictionsResponseBody,
  ModerationAnalytics,
  ModeratorVacationResponseBody,
  ModlogResponseBody,
} from '@/types/api-responses'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

const moderationQueueFixture =
  communitiesModerationQueueDefault as unknown as CommunityModerationQueueResponseBody

export const COMMUNITY_LISTS_MODERATION_DECLARATIONS = [
  defineWebApiFixture<CommunityBansResponseBody>()(
    'web.communities.bans.default',
    communitiesBansDefault,
    context => context.server.communityModeration.getCommunityBans('test-community'),
    [context => context.client.communityBans.fetchCommunityBans('test-community')],
  ),
  defineWebApiFixture<CommunityListItemCountsResponseBody>()(
    'web.communities.list-items.counts.default',
    communitiesListItemsCountsDefault,
    context => context.server.communities.getCommunityListItemCounts('test-community'),
  ),
  defineWebApiFixture<CommunityListDomainsResponseBody>()(
    'web.communities.list-items.domains.default',
    communitiesListItemsDomainsDefault,
    context =>
      context.server.communities.getCommunityListDomains('test-community', {
        searchParams: { limit: 25 },
      }),
  ),
  defineWebApiFixture<CommunityListPostsResponseBody>()(
    'web.communities.list-items.posts.default',
    communitiesListItemsPostsDefault,
    context =>
      context.server.communities.getCommunityListPosts('test-community', {
        searchParams: { limit: 25 },
      }),
  ),
  defineWebApiFixture<CommunityListRssFeedsResponseBody>()(
    'web.communities.list-items.rss-feeds.default',
    communitiesListItemsRssFeedsDefault,
    context =>
      context.server.communities.getCommunityListRssFeeds('test-community', {
        searchParams: { limit: 25 },
      }),
  ),
  defineWebApiFixture<CommunityListTopicsResponseBody>()(
    'web.communities.list-items.topics.default',
    communitiesListItemsTopicsDefault,
    context =>
      context.server.communities.getCommunityListTopics('test-community', {
        searchParams: { limit: 25 },
      }),
  ),
  defineWebApiFixture<CommunityListUrlsResponseBody>()(
    'web.communities.list-items.urls.default',
    communitiesListItemsUrlsDefault,
    context =>
      context.server.communities.getCommunityListUrls('test-community', {
        searchParams: { limit: 25 },
      }),
  ),
  defineWebApiFixture<ModerationAnalytics>()(
    'web.communities.moderation-analytics.default',
    communitiesModerationAnalyticsDefault,
    context =>
      context.server.moderationAnalytics.getCommunityModerationAnalytics('test-community', {
        range: '30d',
      }),
  ),
  defineWebApiFixture<CommunityModerationQueueResponseBody>()(
    'web.communities.moderation-queue.default',
    moderationQueueFixture,
    context => context.server.communityModeration.getCommunityModerationQueue('test-community'),
  ),
  defineWebApiFixture<CommunityModeratorStatsResponseBody>()(
    'web.communities.moderator-stats.default',
    communitiesModeratorStatsDefault,
    context =>
      context.server.communityModeration.getCommunityModeratorStats('test-community', {
        searchParams: { window: 30 },
      }),
    [
      context =>
        context.client.communityModeratorStats.fetchCommunityModeratorStats('test-community'),
    ],
  ),
  defineWebApiFixture<ModeratorVacationResponseBody>()(
    'web.communities.moderator-vacation.default',
    communitiesModeratorVacationDefault,
    context => context.server.communityModeratorVacation.getMyModeratorVacation('test-community'),
    [context => context.client.moderatorVacation.fetchMyModeratorVacation('test-community')],
  ),
  defineWebApiFixture<ModlogResponseBody>()(
    'web.communities.modlog.default',
    communitiesModlogDefault,
    context => context.server.communityModeration.getCommunityModlog('test-community'),
    [context => context.client.modlog.fetchCommunityModlog('test-community')],
  ),
  defineWebApiFixture<ModmailInboxResponseBody>()(
    'web.communities.modmail.default',
    communitiesModmailDefault,
    context => context.server.modmail.getModmailInboxServer('test-community'),
    [context => context.client.modmail.getModmailInboxClient('test-community')],
  ),
  defineWebApiFixture<ModmailMessagesResponseBody>()(
    'web.communities.modmail-messages.default',
    communitiesModmailMessagesDefault,
    context =>
      context.server.modmail.getModmailThreadMessagesServer(
        'test-community',
        '00000000-0000-7000-8000-000000000501',
      ),
    [
      context =>
        context.client.modmail.getModmailMessagesClient(
          'test-community',
          '00000000-0000-7000-8000-000000000501',
        ),
    ],
  ),
  defineWebApiFixture<CommunityRestrictionsResponseBody>()(
    'web.communities.restrictions.default',
    communitiesRestrictionsDefault,
    context => context.server.communityRestrictions.getCommunityRestrictions('test-community'),
    [context => context.client.communityRestrictions.fetchCommunityRestrictions('test-community')],
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
