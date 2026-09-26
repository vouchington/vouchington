import { serverApi } from '../../../lib/api/server/instance'
import * as clientAdmin from '../../../lib/api/client/admin'
import * as clientAdminOAuthClients from '../../../lib/api/client/admin-oauth-clients'
import * as clientApiKeys from '../../../lib/api/client/api-keys'
import * as clientAuth from '../../../lib/api/client/auth'
import * as clientCaptchaConfig from '../../../lib/api/client/captcha-config'
import * as clientCommunities from '../../../lib/api/client/communities'
import * as clientCommunityBans from '../../../lib/api/client/community-bans'
import * as clientCommunityAgentPrompts from '../../../lib/api/client/community-agent-prompts'
import * as clientCommunityAiAgents from '../../../lib/api/client/community-ai-agents'
import * as clientCommunityArchive from '../../../lib/api/client/community-archive'
import * as clientCommunityAutomod from '../../../lib/api/client/community-automod'
import * as clientCommunityRestrictions from '../../../lib/api/client/community-restrictions'
import * as clientCommunitySearch from '../../../lib/api/client/community-search'
import * as clientCommunityModeratorStats from '../../../lib/api/client/community-moderator-stats'
import * as clientCurrencies from '../../../lib/api/client/currencies'
import * as clientCopyrightEmailIntakes from '../../../lib/api/client/copyright-email-intakes'
import * as clientCopyrightNotices from '../../../lib/api/client/copyright-notices'
import * as clientDynamicConfig from '../../../lib/api/client/dynamic-config'
import * as clientEntityRelations from '../../../lib/api/client/entity-relations'
import * as clientFeatureFlags from '../../../lib/api/client/feature-flags'
import * as clientFriendRecommendations from '../../../lib/api/client/friend-recommendations'
import * as clientHouseholds from '../../../lib/api/client/households'
import * as clientImportExport from '../../../lib/api/client/import-export'
import * as clientMemberships from '../../../lib/api/client/memberships'
import * as clientModmail from '../../../lib/api/client/modmail'
import * as clientModlog from '../../../lib/api/client/modlog'
import * as clientModeratorVacation from '../../../lib/api/client/moderator-vacation'
import * as clientMq from '../../../lib/api/client/mq'
import * as clientMy from '../../../lib/api/client/my'
import * as clientMyNotifications from '../../../lib/api/client/my-notifications'
import * as clientOAuthApps from '../../../lib/api/client/oauth-apps'
import * as clientOAuthGrants from '../../../lib/api/client/oauth-grants'
import * as clientPodcastEpisodeChapters from '../../../lib/api/client/podcast-episode-chapters'
import * as clientPsql from '../../../lib/api/client/psql'
import * as clientReferralClicks from '../../../lib/api/client/referral-clicks'
import * as clientReferralLinks from '../../../lib/api/client/referral-links'
import * as clientReports from '../../../lib/api/client/reports'
import * as clientTopics from '../../../lib/api/client/topics'
import * as clientValkey from '../../../lib/api/client/valkey'
import * as clientUsers from '../../../lib/api/client/users'
import * as clientWarnings from '../../../lib/api/client/warnings'
import * as serverAdminOAuthClients from '../../../lib/api/server/admin-oauth-clients'
import * as serverApiKeys from '../../../lib/api/server/api-keys'
import * as serverCommunities from '../../../lib/api/server/communities'
import * as serverCopyrightNotices from '../../../lib/api/server/copyright-notices'
import * as serverCommunityAgentPrompts from '../../../lib/api/server/community-agent-prompts'
import * as serverCommunityAutomod from '../../../lib/api/server/community-automod'
import * as serverCommunityModeration from '../../../lib/api/server/community-moderation'
import * as serverCommunityModeratorVacation from '../../../lib/api/server/community-moderator-vacation'
import * as serverCommunityRestrictions from '../../../lib/api/server/community-restrictions'
import * as serverEntityRelations from '../../../lib/api/server/entity-relations'
import * as serverFeatureFlags from '../../../lib/api/server/feature-flags'
import * as serverFeeds from '../../../lib/api/server/feeds'
import * as serverGrowthMetrics from '../../../lib/api/server/growth-metrics'
import * as serverHouseholds from '../../../lib/api/server/households'
import * as serverModerationAnalytics from '../../../lib/api/server/moderation-analytics'
import * as serverModmail from '../../../lib/api/server/modmail'
import * as serverMy from '../../../lib/api/server/my'
import * as serverPsql from '../../../lib/api/server/psql'
import * as serverReferralLinks from '../../../lib/api/server/referral-links'
import * as serverReports from '../../../lib/api/server/reports'
import * as serverRssFeedItems from '../../../lib/api/server/rss-feed-items'
import * as serverOAuthApps from '../../../lib/api/server/oauth-apps'
import * as serverOAuthGrants from '../../../lib/api/server/oauth-grants'
import * as serverScopes from '../../../lib/api/server/scopes'
import * as serverTopicRecommendations from '../../../lib/api/server/topic-recommendations'
import * as serverTopics from '../../../lib/api/server/topics'
import * as serverTrendingCommunities from '../../../lib/api/server/trending-communities'
import * as serverTrendingReferralPrograms from '../../../lib/api/server/trending-referral-programs'
import * as serverUserBookmarkReferences from '../../../lib/api/server/user-bookmark-references'
import type { WebFixtureEndpointContext } from '@/test-helpers/api-responses/declarations/endpoint-context'

export const WEB_FIXTURE_ENDPOINT_CONTEXT = {
  client: {
    admin: clientAdmin,
    adminOAuthClients: clientAdminOAuthClients,
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
    copyrightEmailIntakes: clientCopyrightEmailIntakes,
    copyrightNotices: clientCopyrightNotices,
    dynamicConfig: clientDynamicConfig,
    entityRelations: clientEntityRelations,
    featureFlags: clientFeatureFlags,
    friendRecommendations: clientFriendRecommendations,
    households: clientHouseholds,
    importExport: clientImportExport,
    memberships: clientMemberships,
    modmail: clientModmail,
    modlog: clientModlog,
    moderatorVacation: clientModeratorVacation,
    mq: clientMq,
    my: clientMy,
    myNotifications: clientMyNotifications,
    oauthApps: clientOAuthApps,
    oauthGrants: clientOAuthGrants,
    podcastEpisodeChapters: clientPodcastEpisodeChapters,
    psql: clientPsql,
    referralClicks: clientReferralClicks,
    referralLinks: clientReferralLinks,
    reports: clientReports,
    topics: clientTopics,
    valkey: clientValkey,
    users: clientUsers,
    warnings: clientWarnings,
  },
  server: {
    adminOAuthClients: serverAdminOAuthClients,
    apiKeys: serverApiKeys,
    communities: serverCommunities,
    copyrightNotices: serverCopyrightNotices,
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
    oauthApps: serverOAuthApps,
    oauthGrants: serverOAuthGrants,
    psql: serverPsql,
    referralLinks: serverReferralLinks,
    reports: serverReports,
    rssFeedItems: serverRssFeedItems,
    scopes: serverScopes,
    topicRecommendations: serverTopicRecommendations,
    topics: serverTopics,
    trendingCommunities: serverTrendingCommunities,
    trendingReferralPrograms: serverTrendingReferralPrograms,
    userBookmarkReferences: serverUserBookmarkReferences,
  },
  rawServer: serverApi,
} as const satisfies WebFixtureEndpointContext
