import type { NavIntent } from '../../../lib/navigation/intents/types'
import type { MessageKey } from '@ts-shared/ui-messages'

export function makeIntent(overrides?: Partial<NavIntent>): NavIntent {
  return {
    id: 'web-search',
    label: 'Web Search' as MessageKey,
    icon: (() => null) as NavIntent['icon'],
    groups: [
      {
        label: 'Browse' as MessageKey,
        dataPw: 'sidebar-group-browse',
        items: [
          { label: 'Search' as MessageKey, href: '/web-search', dataPw: 'sidebar-nav-search' },
          {
            label: 'URLs' as MessageKey,
            href: '/urls',
            dataPw: 'sidebar-nav-urls',
            requiresAuth: true,
          },
        ],
      },
      {
        label: 'Bookmarks' as MessageKey,
        dataPw: 'sidebar-group-bookmarks',
        requiresAuth: true,
        items: [
          {
            label: 'Saved Links' as MessageKey,
            href: '/my/urls/saved',
            dataPw: 'sidebar-nav-my-urls-saved',
            requiresAuth: true,
          },
        ],
      },
    ],
    ...overrides,
  }
}

export function makeAuthOnlyIntent(): NavIntent {
  return {
    id: 'chat',
    label: 'Chat' as MessageKey,
    icon: (() => null) as NavIntent['icon'],
    requiresAuth: true,
    groups: [
      {
        label: 'Chat' as MessageKey,
        dataPw: 'sidebar-group-chat',
        requiresAuth: true,
        items: [
          {
            label: 'New Chat' as MessageKey,
            href: '/chat',
            dataPw: 'sidebar-nav-new-chat',
            exact: true,
          },
          {
            label: 'Support' as MessageKey,
            href: '/chat/support',
            dataPw: 'sidebar-nav-chat-support',
          },
        ],
      },
    ],
  }
}

export const HOME = { nameKey: 'nav.home' as MessageKey, path: '/' }
export const LEAF = { name: 'Domains', path: '/domains' }
