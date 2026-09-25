import { Bell, LayoutTemplate } from 'lucide-react'

import type { NavIntent } from './types'

export const PRODUCT_COMMUNICATION_INTENTS: readonly NavIntent[] = [
  {
    id: 'messages',
    label: 'extracted.intents.productCommunication.messagesNotifications_6dfecd8b',
    icon: Bell,
    requiresAuth: true,
    groups: [
      {
        label: 'extracted.intents.productCommunication.notifications_78801183',
        dataPw: 'sidebar-group-notifications',
        requiresAuth: true,
        items: [
          {
            label: 'extracted.intents.productCommunication.notifications_78801183',
            href: '/my/notifications',
            dataPw: 'sidebar-nav-notifications',
            requiresAuth: true,
          },
        ],
      },
      {
        label: 'extracted.intents.productCommunication.messages_04d7b483',
        dataPw: 'sidebar-group-messages',
        requiresAuth: true,
        items: [
          {
            label: 'extracted.intents.productCommunication.allMessages_020dc04d',
            href: '/messages',
            dataPw: 'sidebar-nav-messages',
            exact: true,
            requiresAuth: true,
          },
        ],
      },
    ],
  },
  {
    id: 'landing-pages',
    label: 'extracted.intents.productCommunication.landingPages_6e8d0e5d',
    icon: LayoutTemplate,
    requiresAuth: true,
    groups: [
      {
        label: 'extracted.intents.productCommunication.browse_3227aa96',
        dataPw: 'sidebar-group-browse',
        items: [
          {
            label: 'extracted.intents.productCommunication.myLandingPages_68f82dad',
            href: '/my/landing-pages',
            dataPw: 'sidebar-nav-my-landing-pages',
          },
        ],
      },
    ],
  },
]
