import { Globe } from 'lucide-react'

import type { NavIntent } from './types'

export const WEB_SEARCH_INTENT: NavIntent = {
  id: 'web-search',
  label: 'extracted.intents.productSearch.webSearch_d04fc7d7',
  icon: Globe,
  groups: [
    {
      label: 'extracted.intents.productSearch.browse_3227aa96',
      dataPw: 'sidebar-group-browse',
      items: [
        {
          label: 'extracted.intents.productSearch.search_49c266ba',
          href: '/web-search',
          dataPw: 'sidebar-nav-search',
        },
        {
          label: 'extracted.intents.productSearch.domains_ced67718',
          href: '/domains',
          dataPw: 'sidebar-nav-domains',
        },
        {
          label: 'extracted.intents.productSearch.sources_caf85b08',
          href: '/sources',
          dataPw: 'sidebar-nav-sources',
        },
        {
          label: 'extracted.intents.productSearch.urls_1240054e',
          href: '/urls',
          dataPw: 'sidebar-nav-urls',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productSearch.importExportSources_7b7ffe10',
          href: '/my/sources/import-export',
          dataPw: 'sidebar-nav-sources-import-export',
          requiresAuth: true,
        },
      ],
    },
    {
      label: 'extracted.intents.productSearch.bookmarks_96316f0f',
      dataPw: 'sidebar-group-bookmarks',
      requiresAuth: true,
      items: [
        {
          label: 'extracted.intents.productSearch.savedLinks_527bc63c',
          href: '/my/urls/saved',
          dataPw: 'sidebar-nav-my-urls-saved',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productSearch.mutedDomains_94510a32',
          href: '/my/domains/muted',
          dataPw: 'sidebar-nav-my-domains-muted',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productSearch.blockedDomains_01999296',
          href: '/my/domains/blocked',
          dataPw: 'sidebar-nav-my-domains-blocked',
          requiresAuth: true,
        },
      ],
    },
  ],
}
