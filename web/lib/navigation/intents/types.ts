import type { ComponentType } from 'react'
import type { MessageKey } from '@ts-shared/ui-messages'

export type NavItem = {
  label: MessageKey
  href: string
  dataPw: string
  comingSoon?: boolean
  requiresAuth?: boolean
  exact?: boolean
  excludePathPrefixes?: string[]
}

export type NavGroup = {
  label: MessageKey
  dataPw: string
  requiresAuth?: boolean
  roles?: readonly string[]
  items: NavItem[]
}

export type NavIntentId =
  | 'news'
  | 'podcasts'
  | 'videos'
  | 'posts'
  | 'topics'
  | 'referral-links'
  | 'web-search'
  | 'fediverse'
  | 'chat'
  | 'messages'
  | 'landing-pages'
  | 'communities'
  | 'friends'
  | 'lists'
  | 'settings'
  | 'moderation'
  | 'support'
  | 'engineering'
  | 'growth'

export type NavIntent = {
  id: NavIntentId
  label: MessageKey
  icon: ComponentType<{ className?: string }>
  requiresAuth?: boolean
  roles?: readonly string[]
  featureFlag?: string
  groups: NavGroup[]
}
