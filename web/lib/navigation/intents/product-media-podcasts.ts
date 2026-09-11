import { Headphones } from 'lucide-react'

import type { NavIntent } from './types'

export const PODCASTS_INTENT: NavIntent = {
  id: 'podcasts',
  label: 'extracted.intents.productMediaPodcasts.podcasts_6ac749b3',
  icon: Headphones,
  groups: [
    {
      label: 'extracted.intents.productMediaPodcasts.browse_3227aa96',
      dataPw: 'sidebar-group-browse',
      items: [
        {
          label: 'extracted.intents.productMediaPodcasts.myPodcastEpisodesFeed_a0c523e2',
          href: '/feed/podcasts',
          dataPw: 'sidebar-nav-your-podcasts-feed',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productMediaPodcasts.allPodcastEpisodes_3dcc70fc',
          href: '/podcast-episodes',
          dataPw: 'sidebar-nav-podcast-episodes',
        },
        {
          label: 'extracted.intents.productMediaPodcasts.allPodcasts_54007cce',
          href: '/podcasts',
          dataPw: 'sidebar-nav-all-podcasts',
        },
      ],
    },
    {
      label: 'extracted.intents.productMediaPodcasts.episodeBookmarks_fb7f7f9d',
      dataPw: 'sidebar-group-episode-bookmarks',
      requiresAuth: true,
      items: [
        {
          label: 'extracted.intents.productMediaPodcasts.savedEpisodes_a8d3fb46',
          href: '/my/podcast-episodes/saved',
          dataPw: 'sidebar-nav-my-podcast-episodes-saved',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productMediaPodcasts.hiddenEpisodes_be7de6e2',
          href: '/my/podcast-episodes/hidden',
          dataPw: 'sidebar-nav-my-podcast-episodes-hidden',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productMediaPodcasts.recentlyViewedEpisodes_7bdbff30',
          href: '/my/podcast-episodes/viewed',
          dataPw: 'sidebar-nav-my-podcast-episodes-viewed',
          requiresAuth: true,
        },
      ],
    },
    {
      label: 'extracted.intents.productMediaPodcasts.sourceBookmarks_47e1b795',
      dataPw: 'sidebar-group-source-bookmarks',
      requiresAuth: true,
      items: [
        {
          label: 'extracted.intents.productMediaPodcasts.followedPodcasts_7ff90cde',
          href: '/my/podcasts',
          dataPw: 'sidebar-nav-my-podcasts',
          requiresAuth: true,
          exact: true,
        },
        {
          label: 'extracted.intents.productMediaPodcasts.mutedPodcasts_131446ce',
          href: '/my/podcasts/muted',
          dataPw: 'sidebar-nav-my-podcasts-muted',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productMediaPodcasts.recentlyViewedPodcasts_bec02586',
          href: '/my/podcasts/viewed',
          dataPw: 'sidebar-nav-my-podcasts-viewed',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productMediaPodcasts.importExportPodcasts_6aff6305',
          href: '/my/podcasts/import-export',
          dataPw: 'sidebar-nav-podcasts-import-export',
          requiresAuth: true,
        },
      ],
    },
  ],
}
