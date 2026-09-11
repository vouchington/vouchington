/**
 * Raw route config data for bookmark pages.
 * Imported by bookmark-route-configs.ts — do not import this directly.
 */
import type { BookmarkRouteConfig } from './bookmark-route-configs'
import { bookmarkRouteConfigDataMedia } from './bookmark-route-config-data-media'
import { bookmarkRouteConfigDataUsers } from './bookmark-route-config-data-users'

export const bookmarkRouteConfigData = {
  ...bookmarkRouteConfigDataMedia,
  ...bookmarkRouteConfigDataUsers,
  'posts/saved': {
    family: 'saved' as const,
    path: '/my/posts/saved',
    title: 'extracted.lib.bookmarkRouteConfigData.mySavedPosts_3c21d433',
    description: 'extracted.lib.bookmarkRouteConfigData.postsYouHaveSaved_0127de9f',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigData.postsFeed_a7a6413a',
      path: '/feed/posts',
    },
  },
  'posts/hidden': {
    family: 'hidden' as const,
    path: '/my/posts/hidden',
    title: 'extracted.lib.bookmarkRouteConfigData.myHiddenPosts_aa79d15b',
    description: 'extracted.lib.bookmarkRouteConfigData.postsYouHaveHidden_befe6caf',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigData.postsFeed_a7a6413a',
      path: '/feed/posts',
    },
  },
  'posts/following': {
    family: 'following' as const,
    path: '/my/posts/following',
    title: 'extracted.lib.bookmarkRouteConfigData.myFollowedPosts_fd57bee4',
    description: 'extracted.lib.bookmarkRouteConfigData.postsYouAreFollowingForUpdates_8abd9e6e',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigData.postsFeed_a7a6413a',
      path: '/feed/posts',
    },
  },
  'posts/subscribed': {
    family: 'subscribed' as const,
    path: '/my/posts/subscribed',
    title: 'extracted.lib.bookmarkRouteConfigData.subscribedToPosts_d21eed77',
    description: 'extracted.lib.bookmarkRouteConfigData.postThreadsYouAreSubscribedTo_1a865656',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigData.postsFeed_a7a6413a',
      path: '/feed/posts',
    },
  },
  'topics/following': {
    family: 'following' as const,
    path: '/my/topics/following',
    title: 'extracted.lib.bookmarkRouteConfigData.myFollowedTopics_87f91df6',
    description: 'extracted.lib.bookmarkRouteConfigData.topicsYouFollow_0c6d141d',
    breadcrumb: { name: 'extracted.lib.bookmarkRouteConfigData.topics_e22820fc', path: '/topics' },
  },
  'topics/muted': {
    family: 'muted' as const,
    path: '/my/topics/muted',
    title: 'extracted.lib.bookmarkRouteConfigData.myMutedTopics_f64502c2',
    description: 'extracted.lib.bookmarkRouteConfigData.topicsYouHaveMuted_e358325d',
    breadcrumb: { name: 'extracted.lib.bookmarkRouteConfigData.topics_e22820fc', path: '/topics' },
  },
  'topics/blocked': {
    family: 'blocked' as const,
    path: '/my/topics/blocked',
    title: 'extracted.lib.bookmarkRouteConfigData.myBlockedTopics_06bb6409',
    description: 'extracted.lib.bookmarkRouteConfigData.topicsYouHaveBlocked_8adaa339',
    breadcrumb: { name: 'extracted.lib.bookmarkRouteConfigData.topics_e22820fc', path: '/topics' },
  },
  'topics/viewed': {
    family: 'viewed-items' as const,
    path: '/my/topics/viewed',
    title: 'extracted.lib.bookmarkRouteConfigData.myRecentlyViewedTopics_fbe82a82',
    description: 'extracted.lib.bookmarkRouteConfigData.topicsYouHaveRecentlyViewed_859310a9',
    breadcrumb: { name: 'extracted.lib.bookmarkRouteConfigData.topics_e22820fc', path: '/topics' },
  },
  'topics/import-export': {
    family: 'import-export' as const,
    path: '/my/topics/import-export',
    title: 'extracted.lib.bookmarkRouteConfigData.importExportTopics_30cb486c',
    description: 'extracted.lib.bookmarkRouteConfigData.importOrExportYourTopicFollows_9c7daa98',
    breadcrumb: { name: 'extracted.lib.bookmarkRouteConfigData.topics_e22820fc', path: '/topics' },
  },
  'communities/saved': {
    family: 'saved' as const,
    path: '/my/communities/saved',
    title: 'extracted.lib.bookmarkRouteConfigData.mySavedCommunities_4b46995f',
    description: 'extracted.lib.bookmarkRouteConfigData.communitiesYouHaveSaved_c82e2c24',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigData.communities_c864f329',
      path: '/communities',
    },
  },
  'communities/proxy-following': {
    family: 'following' as const,
    path: '/my/communities/proxy-following',
    title: 'extracted.lib.bookmarkRouteConfigData.myProxyFollowedCommunities_8798b629',
    description: 'extracted.lib.bookmarkRouteConfigData.communitiesYouAreProxyFollowing_ae9b5030',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigData.communities_c864f329',
      path: '/communities',
    },
  },
  'communities/proxy-muted': {
    family: 'muted' as const,
    path: '/my/communities/proxy-muted',
    title: 'extracted.lib.bookmarkRouteConfigData.myProxyMutedCommunities_8a41c238',
    description: 'extracted.lib.bookmarkRouteConfigData.communitiesYouHaveProxyMuted_96b94504',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigData.communities_c864f329',
      path: '/communities',
    },
  },
  'domains/muted': {
    family: 'muted' as const,
    path: '/my/domains/muted',
    title: 'extracted.lib.bookmarkRouteConfigData.myMutedDomains_4de01199',
    description: 'extracted.lib.bookmarkRouteConfigData.domainsYouHaveMuted_693b403c',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigData.domains_ced67718',
      path: '/domains',
    },
  },
  'domains/blocked': {
    family: 'blocked' as const,
    path: '/my/domains/blocked',
    title: 'extracted.lib.bookmarkRouteConfigData.myBlockedDomains_ab322e2e',
    description: 'extracted.lib.bookmarkRouteConfigData.domainsYouHaveBlocked_ee2d99d1',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigData.domains_ced67718',
      path: '/domains',
    },
  },
  'urls/saved': {
    family: 'saved' as const,
    path: '/my/urls/saved',
    title: 'extracted.lib.bookmarkRouteConfigData.mySavedLinks_3a3790d1',
    description: 'extracted.lib.bookmarkRouteConfigData.webLinksYouHaveSaved_4b6fe8f4',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigData.sources_caf85b08',
      path: '/sources',
    },
  },
  'sources/import-export': {
    family: 'import-export' as const,
    path: '/my/sources/import-export',
    title: 'extracted.lib.bookmarkRouteConfigData.importExportSources_7b7ffe10',
    description:
      'extracted.lib.bookmarkRouteConfigData.importOrExportYourSourceSubscriptions_f9610d88',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigData.sources_caf85b08',
      path: '/sources',
    },
  },
  'referral-links': {
    family: null,
    path: '/my/referral-links',
    title: 'extracted.lib.bookmarkRouteConfigData.referralLinks_4348d2ad',
    description: 'extracted.lib.bookmarkRouteConfigData.manageYourReferralLinksAcrossAll_cda1c106',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigData.referralLinkFeed_72c71010',
      path: '/feed/referral-links',
    },
  },
  referrals: {
    family: null,
    path: '/my/referrals',
    title: 'extracted.lib.bookmarkRouteConfigData.myReferrals_679e6b61',
    description: 'extracted.lib.bookmarkRouteConfigData.trackYourReferralActivity_64f2db67',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigData.referralPrograms_ceb8b9ad',
      path: '/referral-programs',
    },
  },
} satisfies Record<string, BookmarkRouteConfig>
