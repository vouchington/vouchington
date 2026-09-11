/**
 * Bookmark route config data for video/channel pages (RSS video sources).
 * Imported by bookmark-route-config-data-media.ts — do not import this directly.
 */
import type { BookmarkRouteConfig } from './bookmark-route-configs'

export const bookmarkRouteConfigDataVideos = {
  'videos/saved': {
    family: 'saved' as const,
    path: '/my/videos/saved',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.mySavedVideos_f9d9ef77',
    description: 'extracted.lib.bookmarkRouteConfigDataMedia.videosYouHaveSaved_a6bf3347',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigDataMedia.videos_c9a96394',
      path: '/videos',
    },
  },
  'videos/hidden': {
    family: 'hidden' as const,
    path: '/my/videos/hidden',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.myHiddenVideos_e3804598',
    description: 'extracted.lib.bookmarkRouteConfigDataMedia.videosYouHaveHidden_81d16c0b',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigDataMedia.videos_c9a96394',
      path: '/videos',
    },
  },
  'videos/viewed': {
    family: 'viewed-items' as const,
    path: '/my/videos/viewed',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.myRecentlyViewedVideos_db1973e4',
    description: 'extracted.lib.bookmarkRouteConfigDataMedia.videosYouHaveRecentlyViewed_69935b66',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigDataMedia.videos_c9a96394',
      path: '/videos',
    },
  },
  channels: {
    family: 'following' as const,
    path: '/my/channels',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.myChannels_dfb3e0e5',
    description: 'extracted.lib.bookmarkRouteConfigDataMedia.channelsYouFollow_7a5a2362',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigDataMedia.channels_4c8906cf',
      path: '/channels',
    },
  },
  'channels/muted': {
    family: 'muted' as const,
    path: '/my/channels/muted',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.myMutedChannels_dba96b01',
    description: 'extracted.lib.bookmarkRouteConfigDataMedia.channelsYouHaveMuted_a470ab49',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigDataMedia.channels_4c8906cf',
      path: '/channels',
    },
  },
  'channels/viewed': {
    family: 'viewed-sources' as const,
    path: '/my/channels/viewed',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.myRecentlyViewedChannels_3db64369',
    description:
      'extracted.lib.bookmarkRouteConfigDataMedia.channelsYouHaveRecentlyViewed_8c27b313',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigDataMedia.channels_4c8906cf',
      path: '/channels',
    },
  },
  'channels/import-export': {
    family: 'import-export' as const,
    path: '/my/channels/import-export',
    title: 'extracted.lib.bookmarkRouteConfigDataMedia.importExportChannels_8ab0e50a',
    description:
      'extracted.lib.bookmarkRouteConfigDataMedia.importOrExportYourChannelSubscriptions_2e7f0565',
    breadcrumb: {
      name: 'extracted.lib.bookmarkRouteConfigDataMedia.channels_4c8906cf',
      path: '/channels',
    },
  },
} satisfies Record<string, BookmarkRouteConfig>
