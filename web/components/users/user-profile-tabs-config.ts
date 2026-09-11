import type { MessageKey } from '@ts-shared/ui-messages'
import { createUserPathname } from '@/lib/links/entity-href'
import { isActivePath } from '@/lib/utils/path'

export type TopLevelTabName = 'about' | 'posts' | 'topics' | 'friends' | 'sources' | 'communities'

interface TopLevelTabConfig {
  name: TopLevelTabName
  label: MessageKey
  firstHref: (usernameOrId: string) => string
  routePrefixes: (usernameOrId: string) => string[]
  /** When true, pathname must equal the prefix exactly (no sub-paths). */
  exactMatch?: boolean
}

const TOP_LEVEL_TABS: TopLevelTabConfig[] = [
  {
    name: 'about',
    label: 'extracted.users.userProfileTabsConfig.about_4efca0d1',
    firstHref: id => createUserPathname(id),
    routePrefixes: id => [createUserPathname(id)],
    exactMatch: true,
  },
  {
    name: 'posts',
    label: 'extracted.users.userProfileTabsConfig.posts_a80811cf',
    firstHref: id => createUserPathname(id, '/posts'),
    routePrefixes: id =>
      ['/posts', '/discussions', '/reviews', '/comments'].map(s => createUserPathname(id, s)),
  },
  {
    name: 'topics',
    label: 'extracted.users.userProfileTabsConfig.topics_e22820fc',
    firstHref: id => createUserPathname(id, '/topics/following'),
    routePrefixes: id => [createUserPathname(id, '/topics')],
  },
  {
    name: 'friends',
    label: 'extracted.users.userProfileTabsConfig.friends_bd104d1b',
    firstHref: id => createUserPathname(id, '/users/following'),
    routePrefixes: id => [createUserPathname(id, '/users')],
  },
  {
    name: 'sources',
    label: 'extracted.users.userProfileTabsConfig.sources_caf85b08',
    firstHref: id => createUserPathname(id, '/rss-feeds/following'),
    routePrefixes: id => [createUserPathname(id, '/rss-feeds')],
  },
  {
    name: 'communities',
    label: 'extracted.users.userProfileTabsConfig.communities_c864f329',
    firstHref: id => createUserPathname(id, '/communities/member'),
    routePrefixes: id => [createUserPathname(id, '/communities')],
  },
]

export function getVisibleTopLevelTabs() {
  return TOP_LEVEL_TABS
}

export function getActiveTopLevelTab(pathname: string, usernameOrId: string): TopLevelTabName {
  // Use the segment from the actual URL path to avoid mismatches when the URL uses a
  // UUID but usernameOrId is a username (or vice versa).
  const pathSegment = pathname.split('/')[2] ?? usernameOrId
  for (const tab of TOP_LEVEL_TABS) {
    const prefixes = tab.routePrefixes(pathSegment)
    const isActive = tab.exactMatch
      ? prefixes.some(prefix => pathname === prefix)
      : prefixes.some(prefix => isActivePath(pathname, prefix))
    if (isActive) return tab.name
  }
  return 'about'
}

export function getTopLevelTabHref(tab: TopLevelTabConfig, usernameOrId: string): string {
  return tab.firstHref(usernameOrId)
}

export { TOP_LEVEL_TABS }
