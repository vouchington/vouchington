import { Newspaper } from 'lucide-react'

import type { NavIntent } from './types'

export const NEWS_INTENT: NavIntent = {
  id: 'news',
  label: 'extracted.intents.productMediaNews.news_69752f23',
  icon: Newspaper,
  groups: [
    {
      label: 'extracted.intents.productMediaNews.browse_3227aa96',
      dataPw: 'sidebar-group-browse',
      items: [
        {
          label: 'extracted.intents.productMediaNews.myNewsFeed_45cd71ae',
          href: '/feed/news',
          dataPw: 'sidebar-nav-your-news',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productMediaNews.allNews_3651c3d0',
          href: '/news',
          dataPw: 'sidebar-nav-all-news',
        },
        {
          label: 'extracted.intents.productMediaNews.allNewsSources_31ea4dc6',
          href: '/news-sources',
          dataPw: 'sidebar-nav-all-news-sources',
        },
      ],
    },
    {
      label: 'extracted.intents.productMediaNews.newsBookmarks_911304a2',
      dataPw: 'sidebar-group-news-bookmarks',
      requiresAuth: true,
      items: [
        {
          label: 'extracted.intents.productMediaNews.savedNews_5b954d80',
          href: '/my/news-items/saved',
          dataPw: 'sidebar-nav-my-news-items-saved',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productMediaNews.hiddenNews_cfa2e0e3',
          href: '/my/news-items/hidden',
          dataPw: 'sidebar-nav-my-news-items-hidden',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productMediaNews.recentlyViewedNews_809bc5a3',
          href: '/my/news-items/viewed',
          dataPw: 'sidebar-nav-my-news-items-viewed',
          requiresAuth: true,
        },
      ],
    },
    {
      label: 'extracted.intents.productMediaNews.sourceBookmarks_47e1b795',
      dataPw: 'sidebar-group-source-bookmarks',
      requiresAuth: true,
      items: [
        {
          label: 'extracted.intents.productMediaNews.followedNewsSources_dd33239b',
          href: '/my/news-sources',
          dataPw: 'sidebar-nav-my-news-sources',
          requiresAuth: true,
          exact: true,
        },
        {
          label: 'extracted.intents.productMediaNews.mutedNewsSources_ca1e1481',
          href: '/my/news-sources/muted',
          dataPw: 'sidebar-nav-my-news-sources-muted',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productMediaNews.recentlyViewedNewsSources_d6a7ee60',
          href: '/my/news-sources/viewed',
          dataPw: 'sidebar-nav-my-news-sources-viewed',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productMediaNews.importExportNewsSources_bf1ec4ca',
          href: '/my/news-sources/import-export',
          dataPw: 'sidebar-nav-news-sources-import-export',
          requiresAuth: true,
        },
      ],
    },
  ],
}
