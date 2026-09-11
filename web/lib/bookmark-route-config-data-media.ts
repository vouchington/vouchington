/**
 * Bookmark route config data for RSS/media pages (news, podcasts, videos).
 * Imported by bookmark-route-config-data.ts — do not import this directly.
 */

import type { BookmarkRouteConfig } from './bookmark-route-configs'
import { bookmarkRouteConfigDataVideos } from './bookmark-route-config-data-videos'

export const bookmarkRouteConfigDataMedia = {
  ...bookmarkRouteConfigDataVideos,
  'news-items/saved': {
    family: 'saved' as const,
    path: '/my/news-items/saved',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.mySavedNewsItems_1b3ddcea',
    description: 'extracted.lib.bookmarkRouteConfigDataMedia.newsArticlesYouHaveSaved_3e01d39d',
    breadcrumb: { name: 'extracted.lib.bookmarkRouteConfigDataMedia.news_69752f23', path: '/news' },
  },
  'news-items/hidden': {
    family: 'hidden' as const,
    path: '/my/news-items/hidden',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.myHiddenNewsItems_d1be0cae',
    description: 'extracted.lib.bookmarkRouteConfigDataMedia.newsArticlesYouHaveHidden_9ffb8ef2',
    breadcrumb: { name: 'extracted.lib.bookmarkRouteConfigDataMedia.news_69752f23', path: '/news' },
  },
  'news-items/viewed': {
    family: 'viewed-items' as const,
    path: '/my/news-items/viewed',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.myRecentlyViewedNewsItems_053c9c2f',
    description:
      'extracted.lib.bookmarkRouteConfigDataMedia.newsArticlesYouHaveRecentlyViewed_815a5862',
    breadcrumb: { name: 'extracted.lib.bookmarkRouteConfigDataMedia.news_69752f23', path: '/news' },
  },
  'news-sources': {
    family: 'following' as const,
    path: '/my/news-sources',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.myNewsSources_742a7817',
    description: 'extracted.lib.bookmarkRouteConfigDataMedia.newsSourcesYouFollow_6db7a7fb',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigDataMedia.newsSources_238ad263',
      path: '/news-sources',
    },
  },
  'news-sources/muted': {
    family: 'muted' as const,
    path: '/my/news-sources/muted',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.myMutedNewsSources_c0713b2d',
    description: 'extracted.lib.bookmarkRouteConfigDataMedia.newsSourcesYouHaveMuted_a08ebdbe',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigDataMedia.newsSources_238ad263',
      path: '/news-sources',
    },
  },
  'news-sources/viewed': {
    family: 'viewed-sources' as const,
    path: '/my/news-sources/viewed',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.myRecentlyViewedNewsSources_a4f90827',
    description:
      'extracted.lib.bookmarkRouteConfigDataMedia.newsSourcesYouHaveRecentlyViewed_43ae27d0',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigDataMedia.newsSources_238ad263',
      path: '/news-sources',
    },
  },
  'news-sources/import-export': {
    family: 'import-export' as const,
    path: '/my/news-sources/import-export',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.importExportNewsSources_bf1ec4ca',
    description: 'extracted.lib.bookmarkRouteConfigDataMedia.importOrExportYourNewsSource_46539da0',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigDataMedia.newsSources_238ad263',
      path: '/news-sources',
    },
  },
  'podcast-episodes/saved': {
    family: 'saved' as const,
    path: '/my/podcast-episodes/saved',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.mySavedPodcastEpisodes_59c33551',
    description: 'extracted.lib.bookmarkRouteConfigDataMedia.podcastEpisodesYouHaveSaved_df68754c',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigDataMedia.podcastEpisodes_093bc80f',
      path: '/podcast-episodes',
    },
  },
  'podcast-episodes/hidden': {
    family: 'hidden' as const,
    path: '/my/podcast-episodes/hidden',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.myHiddenPodcastEpisodes_4938f738',
    description: 'extracted.lib.bookmarkRouteConfigDataMedia.podcastEpisodesYouHaveHidden_44879b87',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigDataMedia.podcastEpisodes_093bc80f',
      path: '/podcast-episodes',
    },
  },
  'podcast-episodes/viewed': {
    family: 'viewed-items' as const,
    path: '/my/podcast-episodes/viewed',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.myRecentlyViewedPodcastEpisodes_976f0d1a',
    description:
      'extracted.lib.bookmarkRouteConfigDataMedia.podcastEpisodesYouHaveRecentlyViewed_6d6b5e43',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigDataMedia.podcastEpisodes_093bc80f',
      path: '/podcast-episodes',
    },
  },
  podcasts: {
    family: 'following' as const,
    path: '/my/podcasts',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.myPodcasts_fe24ed2c',
    description: 'extracted.lib.bookmarkRouteConfigDataMedia.podcastsYouFollow_3f8e7225',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigDataMedia.podcasts_6ac749b3',
      path: '/podcasts',
    },
  },
  'podcasts/muted': {
    family: 'muted' as const,
    path: '/my/podcasts/muted',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.myMutedPodcasts_fdd2fd17',
    description: 'extracted.lib.bookmarkRouteConfigDataMedia.podcastsYouHaveMuted_ce02261d',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigDataMedia.podcasts_6ac749b3',
      path: '/podcasts',
    },
  },
  'podcasts/viewed': {
    family: 'viewed-sources' as const,
    path: '/my/podcasts/viewed',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.myRecentlyViewedPodcasts_afd29776',
    description:
      'extracted.lib.bookmarkRouteConfigDataMedia.podcastsYouHaveRecentlyViewed_e921ae52',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigDataMedia.podcasts_6ac749b3',
      path: '/podcasts',
    },
  },
  'podcasts/import-export': {
    family: 'import-export' as const,
    path: '/my/podcasts/import-export',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.importExportPodcasts_6aff6305',
    description:
      'extracted.lib.bookmarkRouteConfigDataMedia.importOrExportYourPodcastSubscriptions_14f18be9',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigDataMedia.podcasts_6ac749b3',
      path: '/podcasts',
    },
  },
} satisfies Record<string, BookmarkRouteConfig>
