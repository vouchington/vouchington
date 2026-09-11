import type { MessageKey } from '@ts-shared/ui-messages'

export interface PublicNavItem {
  label: MessageKey
  href: string
  dataPw: string
}

type PublicNavGroup = {
  label: MessageKey
  items: PublicNavItem[]
}

export const EXPLORE_NAV_GROUP: PublicNavGroup = {
  label: 'extracted.navigation.publicNav.explore_3b73900b',
  items: [
    {
      label: 'extracted.navigation.publicNav.stories_6d09cf57',
      href: '/stories',
      dataPw: 'sidebar-nav-stories',
    },
    {
      label: 'extracted.navigation.publicNav.news_69752f23',
      href: '/news',
      dataPw: 'sidebar-nav-news',
    },
    {
      label: 'extracted.navigation.publicNav.discussions_60157cfc',
      href: '/discussions',
      dataPw: 'sidebar-nav-discussions',
    },
    {
      label: 'extracted.navigation.publicNav.dataPoints_1da65e3a',
      href: '/data-points',
      dataPw: 'sidebar-nav-data-points',
    },
    {
      label: 'extracted.navigation.publicNav.reviews_84cb7871',
      href: '/reviews',
      dataPw: 'sidebar-nav-reviews',
    },
  ],
}

export const TOPICS_NAV_GROUP: PublicNavGroup = {
  label: 'extracted.navigation.publicNav.topics_e22820fc',
  items: [
    {
      label: 'extracted.navigation.publicNav.allTopics_0f02bd30',
      href: '/topics',
      dataPw: 'sidebar-nav-all-topics',
    },
    {
      label: 'extracted.navigation.publicNav.sources_caf85b08',
      href: '/sources',
      dataPw: 'sidebar-nav-sources',
    },
    {
      label: 'extracted.navigation.publicNav.referralPrograms_ceb8b9ad',
      href: '/referral-programs',
      dataPw: 'sidebar-nav-referral-programs',
    },
  ],
}

export const TRUST_NAV_GROUP: PublicNavGroup = {
  label: 'extracted.navigation.publicNav.trust_ade9248e',
  items: [
    {
      label: 'extracted.navigation.publicNav.domains_ced67718',
      href: '/domains',
      dataPw: 'sidebar-nav-domains',
    },
  ],
}

export const PUBLIC_NAV_GROUPS: PublicNavGroup[] = [
  EXPLORE_NAV_GROUP,
  TOPICS_NAV_GROUP,
  TRUST_NAV_GROUP,
]

export const PUBLIC_NAV_ITEMS: PublicNavItem[] = PUBLIC_NAV_GROUPS.flatMap(section => section.items)
