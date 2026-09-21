import { Settings2 } from 'lucide-react'

import type { NavIntent } from './types'

export const SETTINGS_INTENT: NavIntent = {
  id: 'settings',
  label: 'extracted.intents.productSettings.settings_74a883a0',
  icon: Settings2,
  requiresAuth: true,
  groups: [
    {
      label: 'extracted.intents.productSettings.account_7e1b0d56',
      dataPw: 'settings-sidebar-account-group',
      items: [
        {
          href: '/my/identity',
          label: 'extracted.intents.productSettings.identity_999f23fc',
          dataPw: 'settings-sidebar-identity',
          exact: true,
        },
        {
          href: '/my/privacy',
          label: 'extracted.intents.productSettings.privacy_54a57c31',
          dataPw: 'settings-sidebar-privacy',
        },
        {
          href: '/my/membership',
          label: 'extracted.intents.productSettings.membership_9feceb93',
          dataPw: 'settings-sidebar-membership',
        },
        {
          href: '/my/identity-verification',
          label: 'extracted.intents.productSettings.idVerification_ae349f8e',
          dataPw: 'settings-sidebar-id-verification',
        },
      ],
    },
    {
      label: 'extracted.intents.productSettings.profile_d696a35b',
      dataPw: 'settings-sidebar-profile-group',
      items: [
        {
          href: '/my/profile',
          label: 'extracted.intents.productSettings.aboutMe_0bf7f38a',
          dataPw: 'settings-sidebar-about-me',
        },
        {
          href: '/my/cards',
          label: 'extracted.intents.productSettings.cards_a52fcbbc',
          dataPw: 'settings-sidebar-cards',
        },
        {
          href: '/my/household',
          label: 'extracted.intents.productSettings.household_a1c6c97f',
          dataPw: 'settings-sidebar-household',
        },
        {
          href: '/my/spending-categories',
          label: 'extracted.intents.productSettings.spending_c2c7ae2a',
          dataPw: 'settings-sidebar-spending',
        },
        {
          href: '/my/rewards-program-point-valuations',
          label: 'extracted.intents.productSettings.pointValues_1a2d98de',
          dataPw: 'settings-sidebar-point-values',
        },
        {
          href: '/my/rewards-program-statuses',
          label: 'extracted.intents.productSettings.statuses_b5c3b907',
          dataPw: 'settings-sidebar-statuses',
        },
      ],
    },
    {
      label: 'extracted.intents.productSettings.preferences_66962f72',
      dataPw: 'settings-sidebar-preferences-group',
      items: [
        {
          href: '/my/preferences',
          label: 'extracted.intents.productSettings.display_34e108c0',
          dataPw: 'settings-sidebar-display',
        },
        {
          href: '/my/language',
          label: 'extracted.intents.productSettings.language_a4fe6526',
          dataPw: 'settings-sidebar-language',
        },
        {
          href: '/my/news-preferences',
          label: 'extracted.intents.productSettings.news_69752f23',
          dataPw: 'settings-sidebar-news',
        },
      ],
    },
    {
      label: 'extracted.intents.productSettings.moderation_126d4415',
      dataPw: 'settings-sidebar-moderation-group',
      items: [
        {
          href: '/my/account-status',
          label: 'extracted.intents.productSettings.accountStatus_dafb01ab',
          dataPw: 'settings-sidebar-account-status',
        },
        {
          href: '/my/disputes',
          label: 'extracted.intents.productSettings.disputes_110fa2bb',
          dataPw: 'settings-sidebar-disputes',
        },
        {
          href: '/my/appeals',
          label: 'extracted.intents.productSettings.appeals_03e8c5a5',
          dataPw: 'settings-sidebar-appeals',
        },
        {
          href: '/my/warnings',
          label: 'extracted.intents.productSettings.warnings_0e04cd10',
          dataPw: 'settings-sidebar-warnings',
        },
        {
          href: '/my/bans',
          label: 'extracted.intents.productSettings.bans_4d5469c7',
          dataPw: 'settings-sidebar-bans',
        },
        {
          href: '/my/removed-posts',
          label: 'extracted.intents.productSettings.removedPosts_2473d1ec',
          dataPw: 'settings-sidebar-removed-posts',
        },
        {
          href: '/moderation-transparency',
          label:
            'extracted.moderationAnalytics.moderationTransparencyPanel.moderationTransparency_0e1d33a9',
          dataPw: 'settings-sidebar-moderation-transparency',
          exact: true,
        },
      ],
    },
    {
      label: 'extracted.intents.productSettings.advanced_9f088dbe',
      dataPw: 'settings-sidebar-advanced-group',
      items: [
        {
          href: '/my/api-keys',
          label: 'extracted.intents.productSettings.apiKeys_c08f17eb',
          dataPw: 'settings-sidebar-api-keys',
        },
        {
          href: '/my/data',
          label: 'extracted.intents.productSettings.yourData_0fdcada4',
          dataPw: 'settings-sidebar-your-data',
        },
      ],
    },
    {
      label: 'extracted.intents.productOther.admin_c1c224b0',
      dataPw: 'settings-sidebar-admin-group',
      roles: ['administrator'] as const,
      items: [
        {
          href: '/memberships/grants',
          label: 'extracted.intents.admin.memberships_b50f1a42',
          dataPw: 'sidebar-link-memberships',
        },
      ],
    },
  ],
}
