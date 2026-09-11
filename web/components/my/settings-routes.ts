import type { MessageKey } from '@ts-shared/ui-messages'
import { isActivePath } from '@/lib/utils/path'

interface TabItem {
  href: string
  label: MessageKey
  dataPw: string
}
interface TabGroup {
  value: string
  label: MessageKey
  items: [TabItem, ...TabItem[]]
}

export const tabGroups: TabGroup[] = [
  {
    value: 'account',
    label: 'extracted.my.settingsRoutes.account_7e1b0d56',
    items: [
      {
        href: '/my/identity',
        label: 'extracted.my.settingsRoutes.identity_999f23fc',
        dataPw: 'settings-nav-dropdown-identity',
      },
      {
        href: '/my/privacy',
        label: 'extracted.my.settingsRoutes.privacy_54a57c31',
        dataPw: 'settings-nav-dropdown-privacy',
      },
      {
        href: '/my/membership',
        label: 'extracted.my.settingsRoutes.membership_9feceb93',
        dataPw: 'settings-nav-dropdown-membership',
      },
      {
        href: '/my/identity-verification',
        label: 'extracted.my.settingsRoutes.idVerification_ae349f8e',
        dataPw: 'settings-nav-dropdown-id-verification',
      },
    ],
  },
  {
    value: 'profile',
    label: 'extracted.my.settingsRoutes.profile_d696a35b',
    items: [
      {
        href: '/my/profile',
        label: 'extracted.my.settingsRoutes.aboutMe_0bf7f38a',
        dataPw: 'settings-nav-dropdown-about-me',
      },
      {
        href: '/my/cards',
        label: 'extracted.my.settingsRoutes.cards_a52fcbbc',
        dataPw: 'settings-nav-dropdown-cards',
      },
      {
        href: '/my/household',
        label: 'extracted.my.settingsRoutes.household_a1c6c97f',
        dataPw: 'settings-nav-dropdown-household',
      },
      {
        href: '/my/spending-categories',
        label: 'extracted.my.settingsRoutes.spending_c2c7ae2a',
        dataPw: 'settings-nav-dropdown-spending',
      },
      {
        href: '/my/rewards-program-point-valuations',
        label: 'extracted.my.settingsRoutes.pointValues_1a2d98de',
        dataPw: 'settings-nav-dropdown-point-values',
      },
      {
        href: '/my/rewards-program-statuses',
        label: 'extracted.my.settingsRoutes.statuses_b5c3b907',
        dataPw: 'settings-nav-dropdown-statuses',
      },
    ],
  },
  {
    value: 'preferences',
    label: 'extracted.my.settingsRoutes.preferences_66962f72',
    items: [
      {
        href: '/my/preferences',
        label: 'extracted.my.settingsRoutes.display_34e108c0',
        dataPw: 'settings-nav-dropdown-display',
      },
      {
        href: '/my/language',
        label: 'extracted.my.settingsRoutes.language_a4fe6526',
        dataPw: 'settings-nav-dropdown-language',
      },
      {
        href: '/my/news-preferences',
        label: 'extracted.my.settingsRoutes.news_69752f23',
        dataPw: 'settings-nav-dropdown-news',
      },
      {
        href: '/my/notification-settings',
        label: 'extracted.my.settingsRoutes.notifications_78801183',
        dataPw: 'settings-nav-dropdown-notifications',
      },
    ],
  },
  {
    value: 'moderation',
    label: 'extracted.my.settingsRoutes.moderation_126d4415',
    items: [
      {
        href: '/my/account-status',
        label: 'extracted.my.settingsRoutes.accountStatus_dafb01ab',
        dataPw: 'settings-nav-dropdown-account-status',
      },
      {
        href: '/my/disputes',
        label: 'extracted.my.settingsRoutes.disputes_110fa2bb',
        dataPw: 'settings-nav-dropdown-disputes',
      },
      {
        href: '/my/appeals',
        label: 'extracted.my.settingsRoutes.appeals_03e8c5a5',
        dataPw: 'settings-nav-dropdown-appeals',
      },
      {
        href: '/my/warnings',
        label: 'extracted.my.settingsRoutes.warnings_0e04cd10',
        dataPw: 'settings-nav-dropdown-warnings',
      },
      {
        href: '/my/bans',
        label: 'extracted.my.settingsRoutes.bans_4d5469c7',
        dataPw: 'settings-nav-dropdown-bans',
      },
      {
        href: '/my/removed-posts',
        label: 'extracted.my.settingsRoutes.removedPosts_2473d1ec',
        dataPw: 'settings-nav-dropdown-removed-posts',
      },
      {
        href: '/moderation-transparency',
        label:
          'extracted.moderationAnalytics.moderationTransparencyPanel.moderationTransparency_0e1d33a9',
        dataPw: 'settings-nav-dropdown-moderation-transparency',
      },
    ],
  },
  {
    value: 'advanced',
    label: 'extracted.my.settingsRoutes.advanced_9f088dbe',
    items: [
      {
        href: '/my/api-keys',
        label: 'extracted.my.settingsRoutes.apiKeys_c08f17eb',
        dataPw: 'settings-nav-dropdown-api-keys',
      },
      {
        href: '/my/data',
        label: 'extracted.my.settingsRoutes.yourData_0fdcada4',
        dataPw: 'settings-nav-dropdown-your-data',
      },
    ],
  },
]

export function getActiveTab(pathname: string): string | null {
  for (const group of tabGroups) {
    for (const item of group.items) {
      if (isActivePath(pathname, item.href)) {
        return group.value
      }
    }
  }
  return null
}

export function isSettingsRoute(pathname: string): boolean {
  return getActiveTab(pathname) !== null
}
