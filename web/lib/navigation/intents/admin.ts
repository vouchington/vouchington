import { Contact, Settings2, ShieldAlert, TrendingUp } from 'lucide-react'

import { DYNAMIC_CONFIG_VIEWER_ROLES } from '../../auth/dynamic-config-access'
import type { NavIntent } from './types'

const DYNAMIC_CONFIG_NAV_ROLES = ['administrator', ...DYNAMIC_CONFIG_VIEWER_ROLES] as const

export const ADMIN_INTENTS: readonly NavIntent[] = [
  {
    id: 'moderation',
    label: 'extracted.intents.admin.moderation_126d4415',
    icon: ShieldAlert,
    requiresAuth: true,
    groups: [
      {
        label: 'extracted.intents.admin.moderation_126d4415',
        dataPw: 'sidebar-group-admin-moderation',
        roles: ['administrator'] as const,
        items: [
          {
            label: 'extracted.intents.admin.reports_dacca3cb',
            href: '/reports',
            dataPw: 'sidebar-link-reports',
          },
          {
            label: 'extracted.intents.admin.appeals_03e8c5a5',
            href: '/appeals',
            dataPw: 'sidebar-link-appeals',
          },
          {
            label: 'extracted.intents.admin.reviewDisputes_25c25858',
            href: '/disputes',
            dataPw: 'sidebar-link-review-disputes',
          },
          {
            label: 'extracted.intents.admin.reviewQueue_83c3c922',
            href: '/posts/review-queue',
            dataPw: 'sidebar-link-review-queue',
          },
          {
            label: 'extracted.intents.admin.modLog_7d4b507b',
            href: '/admin/modlog',
            dataPw: 'sidebar-link-mod-log',
          },
          {
            label: 'extracted.intents.admin.modAnalytics_0a733791',
            href: '/admin/moderation-analytics',
            dataPw: 'sidebar-link-mod-analytics',
          },
          {
            label: 'extracted.intents.admin.voteIntegrity_c05b33b5',
            href: '/vote-integrity/flags',
            dataPw: 'sidebar-link-vote-integrity',
          },
          {
            label: 'extracted.intents.admin.reportIntegrity_7d7661b2',
            href: '/report-integrity/flags',
            dataPw: 'sidebar-link-report-integrity',
          },
        ],
      },
      {
        label: 'extracted.intents.admin.myCases_d27ecf6f',
        dataPw: 'sidebar-group-my-moderation',
        requiresAuth: true,
        items: [
          {
            label: 'extracted.intents.admin.myAppeals_1e44b863',
            href: '/my/appeals',
            dataPw: 'sidebar-nav-my-appeals',
            requiresAuth: true,
          },
          {
            label: 'extracted.intents.admin.myDisputes_c988b30a',
            href: '/my/disputes',
            dataPw: 'sidebar-nav-my-disputes',
            requiresAuth: true,
          },
        ],
      },
    ],
  },
  {
    id: 'crm',
    label: 'extracted.intents.admin.crm_130f70ae',
    icon: Contact,
    roles: ['administrator'] as const,
    groups: [
      {
        label: 'extracted.intents.admin.crm_130f70ae',
        dataPw: 'sidebar-group-admin-crm',
        items: [
          {
            label: 'extracted.intents.admin.crm_130f70ae',
            href: '/crm',
            dataPw: 'sidebar-link-crm',
          },
          {
            label: 'extracted.intents.admin.memberships_b50f1a42',
            href: '/memberships/grants',
            dataPw: 'sidebar-link-memberships',
          },
          {
            label: 'extracted.intents.admin.support_be91940b',
            href: '/support',
            dataPw: 'sidebar-link-support',
            excludePathPrefixes: ['/support/contacts'],
          },
          {
            label: 'extracted.intents.admin.supportContacts_96f650a3',
            href: '/support/contacts',
            dataPw: 'sidebar-link-support-contacts',
          },
        ],
      },
    ],
  },
  {
    id: 'engineering',
    label: 'extracted.intents.admin.engineering_729bb48d',
    icon: Settings2,
    roles: DYNAMIC_CONFIG_NAV_ROLES,
    groups: [
      {
        label: 'extracted.intents.admin.operations_a7c17fa0',
        dataPw: 'sidebar-group-admin-operations',
        roles: ['administrator'] as const,
        items: [
          {
            label: 'extracted.intents.admin.queues_be77db11',
            href: '/admin/queues',
            dataPw: 'sidebar-link-queues',
            exact: true,
          },
          {
            label: 'extracted.intents.admin.postgresql_cc52d032',
            href: '/admin/postgresql',
            dataPw: 'sidebar-link-postgresql',
          },
          {
            label: 'extracted.intents.admin.valkey_2392ad6b',
            href: '/admin/valkey',
            dataPw: 'sidebar-link-valkey',
          },
          {
            label: 'extracted.intents.admin.aiCosts_75cce222',
            href: '/admin/ai-costs',
            dataPw: 'sidebar-link-ai-costs',
          },
        ],
      },
      {
        label: 'extracted.intents.admin.dynamicConfig_59cf5829',
        dataPw: 'sidebar-group-dynamic-config',
        items: [
          {
            label: 'extracted.intents.admin.dynamicConfig_59cf5829',
            href: '/admin/dynamic-config',
            dataPw: 'sidebar-link-admin-dynamic-config',
          },
        ],
      },
    ],
  },
  {
    id: 'growth',
    label: 'extracted.intents.admin.growth_66b06e99',
    icon: TrendingUp,
    roles: ['administrator', 'investor'] as const,
    groups: [
      {
        label: 'extracted.intents.admin.growth_66b06e99',
        dataPw: 'sidebar-group-admin-growth',
        items: [
          {
            label: 'extracted.intents.admin.growth_66b06e99',
            href: '/growth',
            dataPw: 'sidebar-link-growth',
          },
        ],
      },
    ],
  },
]
