/**
 * Route configurations for bookmark pages (/my/news-items/saved, etc.)
 * Config data lives in bookmark-route-config-data.ts to stay within the 200-line limit.
 */
import type { MessageKey } from '@ts-shared/ui-messages'
import type { TitleRouteDropdownItem } from '@/components/shared/title-route-dropdown'
import { bookmarkRouteConfigData } from './bookmark-route-config-data'

export type BookmarkFamily =
  | 'saved'
  | 'hidden'
  | 'viewed-items'
  | 'viewed-sources'
  | 'following'
  | 'muted'
  | 'blocked'
  | 'subscribed'
  | 'import-export'

export interface BookmarkBreadcrumb {
  name: MessageKey
  path: string
}

export interface BookmarkRouteConfig {
  family: BookmarkFamily | null
  path: string
  title: MessageKey
  description: MessageKey
  breadcrumb: BookmarkBreadcrumb
}

export const bookmarkRouteConfigs = bookmarkRouteConfigData

export type BookmarkRouteKey = keyof typeof bookmarkRouteConfigs

/** Returns TitleRouteDropdownItem[] for all entries sharing the same family (≥2 members). */
export function getBookmarkCrossLinks(
  t: (key: MessageKey) => string,
  family: BookmarkFamily | null,
  activePath: string,
): TitleRouteDropdownItem[] {
  if (!family) return []
  // Object.values() widens each entry's literal MessageKey fields to `string`; recover the
  // known-correct shape (validated per-entry by the `satisfies` checks on the config data).
  const allConfigs = Object.values(bookmarkRouteConfigs) as BookmarkRouteConfig[]
  const members = allConfigs.filter(c => c.family === family)
  if (members.length < 2) return []
  return members.map(c => ({
    label: t(c.title),
    href: c.path,
    active: c.path === activePath,
  }))
}
