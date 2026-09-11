import { Gift, Layers } from 'lucide-react'

import type { NavIntent } from './types'
import { WEB_SEARCH_INTENT } from './product-search'

export const PRODUCT_OTHER_INTENTS: readonly NavIntent[] = [
  {
    id: 'topics',
    label: 'extracted.intents.productOther.topics_e22820fc',
    icon: Layers,
    groups: [
      {
        label: 'extracted.intents.productOther.browse_3227aa96',
        dataPw: 'sidebar-group-browse',
        items: [
          {
            label: 'extracted.intents.productOther.allTopics_0f02bd30',
            href: '/topics',
            dataPw: 'sidebar-nav-all-topics',
            exact: true,
          },
          {
            label: 'extracted.intents.productOther.cards_a52fcbbc',
            href: '/cards',
            dataPw: 'sidebar-nav-cards',
          },
          {
            label: 'extracted.intents.productOther.rewardsPrograms_cfc1c858',
            href: '/rewards-programs',
            dataPw: 'sidebar-nav-rewards-programs',
          },
          {
            label: 'extracted.intents.productOther.rewardsProgramStatuses_b2a04de2',
            href: '/rewards-program-statuses',
            dataPw: 'sidebar-nav-rewards-program-statuses',
          },
          {
            label: 'extracted.intents.productOther.spendingCategories_3ed30dfb',
            href: '/spending-categories',
            dataPw: 'sidebar-nav-spending-categories',
          },
          {
            label: 'extracted.intents.productOther.recommendNewTopics_1f5064da',
            href: '/topic-recommendations',
            dataPw: 'sidebar-nav-recommendations',
            requiresAuth: true,
          },
        ],
      },
      {
        label: 'extracted.intents.productOther.bookmarks_96316f0f',
        dataPw: 'sidebar-group-bookmarks',
        requiresAuth: true,
        items: [
          {
            label: 'extracted.intents.productOther.followedTopics_e60a6db0',
            href: '/my/topics/following',
            dataPw: 'sidebar-nav-my-topics-following',
            requiresAuth: true,
          },
          {
            label: 'extracted.intents.productOther.mutedTopics_b2caf51a',
            href: '/my/topics/muted',
            dataPw: 'sidebar-nav-my-topics-muted',
            requiresAuth: true,
          },
          {
            label: 'extracted.intents.productOther.blockedTopics_e4e7ae0d',
            href: '/my/topics/blocked',
            dataPw: 'sidebar-nav-my-topics-blocked',
            requiresAuth: true,
          },
          {
            label: 'extracted.intents.productOther.recentlyViewedTopics_f93ba041',
            href: '/my/topics/viewed',
            dataPw: 'sidebar-nav-my-topics-viewed',
            requiresAuth: true,
          },
          {
            label: 'extracted.intents.productOther.importExport_42191ef4',
            href: '/my/topics/import-export',
            dataPw: 'sidebar-nav-my-topics-import-export',
            requiresAuth: true,
          },
        ],
      },
      {
        label: 'extracted.intents.productOther.admin_c1c224b0',
        dataPw: 'sidebar-group-admin',
        roles: ['administrator'] as const,
        items: [
          {
            label: 'extracted.intents.productOther.createTopic_15c75a49',
            href: '/topics/create',
            dataPw: 'sidebar-nav-create-topic',
          },
          {
            label: 'extracted.intents.productOther.topicAliases_79589f83',
            href: '/topics/aliases',
            dataPw: 'sidebar-nav-topic-aliases',
          },
          {
            label: 'extracted.intents.productOther.topicClaims_105cfd52',
            href: '/admin/topic-claims',
            dataPw: 'sidebar-nav-topic-claims',
          },
          {
            label: 'extracted.intents.productOther.rssFeedCategories_1c481b92',
            href: '/rss-feed-categories',
            dataPw: 'sidebar-nav-rss-feed-categories',
          },
        ],
      },
    ],
  },
  {
    id: 'referral-links',
    label: 'extracted.intents.productOther.referralLinks_4348d2ad',
    icon: Gift,
    groups: [
      {
        label: 'extracted.intents.productOther.browse_3227aa96',
        dataPw: 'sidebar-group-browse',
        items: [
          {
            label: 'extracted.intents.productOther.myReferralLinkFeed_d8f7c5a4',
            href: '/feed/referral-links',
            dataPw: 'sidebar-nav-my-referral-link-feed',
            requiresAuth: true,
          },
          {
            label: 'extracted.intents.productOther.myReferralLinks_ce5b4e52',
            href: '/my/referral-links',
            dataPw: 'sidebar-nav-my-referral-links',
            requiresAuth: true,
          },
          {
            label: 'extracted.intents.productOther.referralPrograms_ceb8b9ad',
            href: '/referral-programs',
            dataPw: 'sidebar-nav-referral-programs',
          },
        ],
      },
      {
        label: 'extracted.intents.productOther.vouchaReferralProgram_1f532bac',
        dataPw: 'sidebar-group-voucha-referral-program',
        requiresAuth: true,
        items: [
          {
            label: 'extracted.intents.productOther.myReferrals_679e6b61',
            href: '/my/referrals',
            dataPw: 'sidebar-nav-my-referrals',
            requiresAuth: true,
          },
        ],
      },
    ],
  },
  WEB_SEARCH_INTENT,
]
