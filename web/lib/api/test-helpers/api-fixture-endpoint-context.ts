import { serverApi } from '../server/instance'
import * as clientAdmin from '../client/admin'
import * as clientApiKeys from '../client/api-keys'
import * as clientAuth from '../client/auth'
import * as clientCaptchaConfig from '../client/captcha-config'
import * as clientCommunities from '../client/communities'
import * as clientCommunityBans from '../client/community-bans'
import * as clientCommunityAgentPrompts from '../client/community-agent-prompts'
import * as clientCommunityAiAgents from '../client/community-ai-agents'
import * as clientCommunityArchive from '../client/community-archive'
import * as clientCommunityAutomod from '../client/community-automod'
import * as clientCommunityRestrictions from '../client/community-restrictions'
import * as clientCommunitySearch from '../client/community-search'
import * as clientCommunityModeratorStats from '../client/community-moderator-stats'
import * as clientCurrencies from '../client/currencies'
import * as clientDynamicConfig from '../client/dynamic-config'
import * as clientEntityRelations from '../client/entity-relations'
import * as clientFeatureFlags from '../client/feature-flags'
import * as clientFriendRecommendations from '../client/friend-recommendations'
import * as clientHouseholds from '../client/households'
import * as clientImportExport from '../client/import-export'
import * as clientModmail from '../client/modmail'
import * as clientModlog from '../client/modlog'
import * as clientModeratorVacation from '../client/moderator-vacation'
import * as clientMq from '../client/mq'
import * as clientMy from '../client/my'
import * as clientMyNotifications from '../client/my-notifications'
import * as clientPodcastEpisodeChapters from '../client/podcast-episode-chapters'
import * as clientPsql from '../client/psql'
import * as clientReferralClicks from '../client/referral-clicks'
import * as clientReferralLinks from '../client/referral-links'
import * as clientReports from '../client/reports'
import * as clientSupport from '../client/support'
import * as clientTopics from '../client/topics'
import * as clientValkey from '../client/valkey'
import * as clientUsers from '../client/users'
import * as clientWarnings from '../client/warnings'
import * as serverApiKeys from '../server/api-keys'
import * as serverCommunities from '../server/communities'
import * as serverCommunityAgentPrompts from '../server/community-agent-prompts'
import * as serverCommunityAutomod from '../server/community-automod'
import * as serverCommunityModeration from '../server/community-moderation'
import * as serverCommunityModeratorVacation from '../server/community-moderator-vacation'
import * as serverCommunityRestrictions from '../server/community-restrictions'
import * as serverEntityRelations from '../server/entity-relations'
import * as serverFeatureFlags from '../server/feature-flags'
import * as serverFeeds from '../server/feeds'
import * as serverGrowthMetrics from '../server/growth-metrics'
import * as serverHouseholds from '../server/households'
import * as serverModerationAnalytics from '../server/moderation-analytics'
import * as serverModmail from '../server/modmail'
import * as serverMy from '../server/my'
import * as serverPsql from '../server/psql'
import * as serverReferralLinks from '../server/referral-links'
import * as serverReports from '../server/reports'
import * as serverRssFeedItems from '../server/rss-feed-items'
import * as serverTopicRecommendations from '../server/topic-recommendations'
import * as serverTopics from '../server/topics'
import * as serverTrendingCommunities from '../server/trending-communities'
import * as serverTrendingReferralPrograms from '../server/trending-referral-programs'
import * as serverUserBookmarkReferences from '../server/user-bookmark-references'
import type { WebFixtureEndpointContext } from '@/test-helpers/api-responses/declarations/endpoint-context'

export const WEB_FIXTURE_ENDPOINT_CONTEXT = {
  client: {
    admin: clientAdmin,
    apiKeys: clientApiKeys,
    auth: clientAuth,
    captchaConfig: clientCaptchaConfig,
    communities: clientCommunities,
    communityBans: clientCommunityBans,
    communityAgentPrompts: clientCommunityAgentPrompts,
    communityAiAgents: clientCommunityAiAgents,
    communityArchive: clientCommunityArchive,
    communityAutomod: clientCommunityAutomod,
    communityRestrictions: clientCommunityRestrictions,
    communitySearch: clientCommunitySearch,
    communityModeratorStats: clientCommunityModeratorStats,
    currencies: clientCurrencies,
    dynamicConfig: clientDynamicConfig,
    entityRelations: clientEntityRelations,
    featureFlags: clientFeatureFlags,
    friendRecommendations: clientFriendRecommendations,
    households: clientHouseholds,
    importExport: clientImportExport,
    modmail: clientModmail,
    modlog: clientModlog,
    moderatorVacation: clientModeratorVacation,
    mq: clientMq,
    my: clientMy,
    myNotifications: clientMyNotifications,
    podcastEpisodeChapters: clientPodcastEpisodeChapters,
    psql: clientPsql,
    referralClicks: clientReferralClicks,
    referralLinks: clientReferralLinks,
    reports: clientReports,
    support: clientSupport,
    topics: clientTopics,
    valkey: clientValkey,
    users: clientUsers,
    warnings: clientWarnings,
  },
  server: {
    apiKeys: serverApiKeys,
    communities: serverCommunities,
    communityAgentPrompts: serverCommunityAgentPrompts,
    communityAutomod: serverCommunityAutomod,
    communityModeration: serverCommunityModeration,
    communityModeratorVacation: serverCommunityModeratorVacation,
    communityRestrictions: serverCommunityRestrictions,
    entityRelations: serverEntityRelations,
    featureFlags: serverFeatureFlags,
    feeds: serverFeeds,
    growthMetrics: serverGrowthMetrics,
    households: serverHouseholds,
    moderationAnalytics: serverModerationAnalytics,
    modmail: serverModmail,
    my: serverMy,
    psql: serverPsql,
    referralLinks: serverReferralLinks,
    reports: serverReports,
    rssFeedItems: serverRssFeedItems,
    topicRecommendations: serverTopicRecommendations,
    topics: serverTopics,
    trendingCommunities: serverTrendingCommunities,
    trendingReferralPrograms: serverTrendingReferralPrograms,
    userBookmarkReferences: serverUserBookmarkReferences,
  },
  rawServer: serverApi,
} as const satisfies WebFixtureEndpointContext
