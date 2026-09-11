/**
 * Raw route config data for feed pages.
 * Imported by feed-route-configs.ts — do not import this directly.
 */
import type {
  PostFeedRouteConfig,
  NewsFeedRouteConfig,
  PodcastFeedRouteConfig,
  VideoFeedRouteConfig,
  ReferralLinksFeedRouteConfig,
} from './feed-route-configs'

type AnyFeedRouteConfig =
  | PostFeedRouteConfig
  | NewsFeedRouteConfig
  | PodcastFeedRouteConfig
  | VideoFeedRouteConfig
  | ReferralLinksFeedRouteConfig

export const feedRouteConfigData = {
  posts: {
    title: 'extracted.lib.feedRouteConfigData.postsFeed_a7a6413a',
    description: 'extracted.lib.feedRouteConfigData.postsFromTopicsAndPeopleYou_da92e2a8',
    category: 'posts',
    feedType: 'any',
    path: '/feed/posts',
    label: 'extracted.lib.feedRouteConfigData.following_344b4271',
  },
  'posts/friends': {
    title: 'extracted.lib.feedRouteConfigData.friendsPosts_e50471b1',
    description: 'extracted.lib.feedRouteConfigData.postsFromPeopleYouFollow_3d900ec0',
    category: 'posts',
    feedType: 'follow_users',
    path: '/feed/posts/friends',
    label: 'extracted.lib.feedRouteConfigData.friends_bd104d1b',
  },
  'posts/topics': {
    title: 'extracted.lib.feedRouteConfigData.topicPosts_2f8cc007',
    description: 'extracted.lib.feedRouteConfigData.postsFromTopicsYouFollow_2324291f',
    category: 'posts',
    feedType: 'follow_topics',
    path: '/feed/posts/topics',
    label: 'extracted.lib.feedRouteConfigData.topics_e22820fc',
  },
  news: {
    title: 'extracted.lib.feedRouteConfigData.newsFeed_adca3118',
    description: 'extracted.lib.feedRouteConfigData.newsFromTopicsAndSourcesYou_af72fb1b',
    category: 'news',
    feedType: 'any',
    path: '/feed/news',
    label: 'extracted.lib.feedRouteConfigData.following_344b4271',
  },
  'news/sources': {
    title: 'extracted.lib.feedRouteConfigData.sourcesNews_2999a161',
    description: 'extracted.lib.feedRouteConfigData.newsFromSourcesYouFollow_1f7d59a7',
    category: 'news',
    feedType: 'follow_rss_feeds',
    path: '/feed/news/sources',
    label: 'extracted.lib.feedRouteConfigData.sources_caf85b08',
  },
  'news/friends': {
    title: 'extracted.lib.feedRouteConfigData.friendsNews_d3c6671f',
    description: 'extracted.lib.feedRouteConfigData.articlesSharedByPeopleYouFollow_3a3fb748',
    category: 'news',
    feedType: 'follow_users',
    path: '/feed/news/friends',
    label: 'extracted.lib.feedRouteConfigData.friends_bd104d1b',
  },
  'news/topics': {
    title: 'extracted.lib.feedRouteConfigData.topicNews_efc3e789',
    description: 'extracted.lib.feedRouteConfigData.newsFromTopicsYouFollow_fd87ba65',
    category: 'news',
    feedType: 'follow_topics',
    path: '/feed/news/topics',
    label: 'extracted.lib.feedRouteConfigData.topics_e22820fc',
  },
  podcasts: {
    title: 'extracted.lib.feedRouteConfigData.podcastEpisodesFeed_a0e2cc3f',
    description: 'extracted.lib.feedRouteConfigData.podcastEpisodesFromSourcesAndPeople_e33c9e02',
    category: 'podcasts',
    feedType: 'any',
    path: '/feed/podcasts',
    label: 'extracted.lib.feedRouteConfigData.following_344b4271',
  },
  'podcasts/friends': {
    title: 'extracted.lib.feedRouteConfigData.friendsPodcastEpisodes_cb24e1a1',
    description: 'extracted.lib.feedRouteConfigData.podcastEpisodesSharedByPeopleYou_3d5f9c3b',
    category: 'podcasts',
    feedType: 'follow_users',
    path: '/feed/podcasts/friends',
    label: 'extracted.lib.feedRouteConfigData.friends_bd104d1b',
  },
  'podcasts/sources': {
    title: 'extracted.lib.feedRouteConfigData.sourcesPodcastEpisodes_7a3a0ea0',
    description: 'extracted.lib.feedRouteConfigData.podcastEpisodesFromPodcastsYouFollow_92f28850',
    category: 'podcasts',
    feedType: 'follow_rss_feeds',
    path: '/feed/podcasts/sources',
    label: 'extracted.lib.feedRouteConfigData.sources_caf85b08',
  },
  'podcasts/topics': {
    title: 'extracted.lib.feedRouteConfigData.topicPodcastEpisodes_a61472ef',
    description: 'extracted.lib.feedRouteConfigData.podcastEpisodesFromTopicsYouFollow_a01843bc',
    category: 'podcasts',
    feedType: 'follow_topics',
    path: '/feed/podcasts/topics',
    label: 'extracted.lib.feedRouteConfigData.topics_e22820fc',
  },
  videos: {
    title: 'extracted.lib.feedRouteConfigData.videoFeed_9d4b38d8',
    description: 'extracted.lib.feedRouteConfigData.videosFromSourcesAndPeopleYou_cf7be947',
    category: 'videos',
    feedType: 'any',
    path: '/feed/videos',
    label: 'extracted.lib.feedRouteConfigData.following_344b4271',
  },
  'videos/friends': {
    title: 'extracted.lib.feedRouteConfigData.friendsVideos_83093657',
    description: 'extracted.lib.feedRouteConfigData.videosSharedByPeopleYouFollow_6f5f7ca5',
    category: 'videos',
    feedType: 'follow_users',
    path: '/feed/videos/friends',
    label: 'extracted.lib.feedRouteConfigData.friends_bd104d1b',
  },
  'videos/sources': {
    title: 'extracted.lib.feedRouteConfigData.sourcesVideos_d5fdb4b3',
    description: 'extracted.lib.feedRouteConfigData.videosFromChannelsYouFollow_78e6864d',
    category: 'videos',
    feedType: 'follow_rss_feeds',
    path: '/feed/videos/sources',
    label: 'extracted.lib.feedRouteConfigData.sources_caf85b08',
  },
  'videos/topics': {
    title: 'extracted.lib.feedRouteConfigData.topicVideos_580a2ce9',
    description: 'extracted.lib.feedRouteConfigData.videosFromTopicsYouFollow_79a9135e',
    category: 'videos',
    feedType: 'follow_topics',
    path: '/feed/videos/topics',
    label: 'extracted.lib.feedRouteConfigData.topics_e22820fc',
  },
  'referral-links': {
    title: 'extracted.lib.feedRouteConfigData.referralLinksFeed_77c0e8f1',
    description: 'extracted.lib.feedRouteConfigData.referralLinksSharedByPeopleYou_e3b4e41e',
    category: 'referral-links',
    feedType: 'follow_users',
    path: '/feed/referral-links',
    label: 'extracted.lib.feedRouteConfigData.following_344b4271',
  },
  'referral-links/mutual': {
    title: 'extracted.lib.feedRouteConfigData.mutualFriendsReferralLinks_85b276f3',
    description: 'extracted.lib.feedRouteConfigData.referralLinksSharedByMutualFriends_a702635d',
    category: 'referral-links',
    feedType: 'mutual_follows',
    path: '/feed/referral-links/mutual',
    label: 'extracted.lib.feedRouteConfigData.mutualFriends_dddbc842',
  },
} satisfies Record<string, AnyFeedRouteConfig>
