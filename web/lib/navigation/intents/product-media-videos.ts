import { Play } from 'lucide-react'

import type { NavIntent } from './types'

export const VIDEOS_INTENT: NavIntent = {
  id: 'videos',
  label: 'extracted.intents.productMediaVideos.videos_c9a96394',
  icon: Play,
  groups: [
    {
      label: 'extracted.intents.productMediaVideos.browse_3227aa96',
      dataPw: 'sidebar-group-browse',
      items: [
        {
          label: 'extracted.intents.productMediaVideos.myVideoFeed_d4cade0f',
          href: '/feed/videos',
          dataPw: 'sidebar-nav-your-videos-feed',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productMediaVideos.allVideos_1c86e601',
          href: '/videos',
          dataPw: 'sidebar-nav-all-videos',
        },
        {
          label: 'extracted.intents.productMediaVideos.allChannels_8a422ea5',
          href: '/channels',
          dataPw: 'sidebar-nav-all-channels',
        },
      ],
    },
    {
      label: 'extracted.intents.productMediaVideos.videoBookmarks_2fe25b69',
      dataPw: 'sidebar-group-video-bookmarks',
      requiresAuth: true,
      items: [
        {
          label: 'extracted.intents.productMediaVideos.savedVideos_df6630ae',
          href: '/my/videos/saved',
          dataPw: 'sidebar-nav-my-videos-saved',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productMediaVideos.hiddenVideos_c4f904fc',
          href: '/my/videos/hidden',
          dataPw: 'sidebar-nav-my-videos-hidden',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productMediaVideos.recentlyViewedVideos_22155e8d',
          href: '/my/videos/viewed',
          dataPw: 'sidebar-nav-my-videos-viewed',
          requiresAuth: true,
        },
      ],
    },
    {
      label: 'extracted.intents.productMediaVideos.sourceBookmarks_47e1b795',
      dataPw: 'sidebar-group-source-bookmarks',
      requiresAuth: true,
      items: [
        {
          label: 'extracted.intents.productMediaVideos.followedChannels_65e5681c',
          href: '/my/channels',
          dataPw: 'sidebar-nav-my-channels',
          requiresAuth: true,
          exact: true,
        },
        {
          label: 'extracted.intents.productMediaVideos.mutedChannels_7a774310',
          href: '/my/channels/muted',
          dataPw: 'sidebar-nav-my-channels-muted',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productMediaVideos.recentlyViewedChannels_8b96ec27',
          href: '/my/channels/viewed',
          dataPw: 'sidebar-nav-my-channels-viewed',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productMediaVideos.importExportChannels_8ab0e50a',
          href: '/my/channels/import-export',
          dataPw: 'sidebar-nav-channels-import-export',
          requiresAuth: true,
        },
      ],
    },
  ],
}
