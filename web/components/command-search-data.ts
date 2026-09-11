// Search data, constants, and API logic for the global command search dialog.
import type { MessageKey, createTranslator } from '@ts-shared/ui-messages'
import { postRouteConfigs } from '@/lib/route-configs'
import type { Topic } from '@/types/topics'
import type { Post, PostType } from '@/types/posts'
import type { Hostname } from '@/types/hostnames'
import type { RssFeedItem } from '@/types/rss-feed-items'
import type { Community } from '@/types/api-responses'
import type { FediverseSearchResult } from '@/types/fediverse-search'
import {
  searchAll,
  searchTopicsOnly,
  searchCommunitiesOnly,
  searchPostsOnly,
  searchNewsOnly,
  searchDomainsOnly,
  searchFediverseOnly,
} from './command-search-data-search'
import { DERIVED_PAGE_SHORTCUTS } from '@/lib/navigation/derive-page-shortcuts'

export type SearchTab =
  | 'all'
  | 'topics'
  | 'communities'
  | 'posts'
  | 'news'
  | 'domains'
  | 'fediverse'
  | 'pages'

export const SEARCH_TABS: { label: MessageKey; value: SearchTab }[] = [
  { label: 'extracted.components.commandSearchData.all_a52ace42', value: 'all' },
  { label: 'extracted.components.commandSearchData.topics_e22820fc', value: 'topics' },
  { label: 'extracted.components.commandSearchData.communities_c864f329', value: 'communities' },
  { label: 'extracted.components.commandSearchData.posts_a80811cf', value: 'posts' },
  { label: 'extracted.components.commandSearchData.news_69752f23', value: 'news' },
  { label: 'extracted.components.commandSearchData.domains_ced67718', value: 'domains' },
  {
    label: 'extracted.components.commandSearchData.fediverse_5b02ab9d',
    value: 'fediverse',
  },
  { label: 'extracted.components.commandSearchData.pages_9046da16', value: 'pages' },
]

export type SearchTabOption = (typeof SEARCH_TABS)[number]

const SEARCH_TABS_WITHOUT_FEDIVERSE = SEARCH_TABS.filter(tab => tab.value !== 'fediverse')

export function getSearchTabs(featureFlags: Record<string, boolean>): SearchTabOption[] {
  if (featureFlags.fediverse === true) return SEARCH_TABS
  return SEARCH_TABS_WITHOUT_FEDIVERSE
}

export type PageShortcut = { label: MessageKey; href: string; dataPw: string }

/** Bound `t()` translator, as returned by `useTranslations()` / `getTranslations()`. */
export type Translator = ReturnType<typeof createTranslator>

export type SearchResults = {
  topics: Topic[]
  posts: CommandSearchPost[]
  news: RssFeedItem[]
  domains: Hostname[]
  communities: Community[]
  fediverse: FediverseSearchResult[]
}

type FullPostSearchResult = Pick<
  Post,
  'id' | 'post_type' | 'title' | 'markdown' | 'declared_language' | 'lingua_rs_detected_language'
>

/** The combined endpoint keeps authored text distinct from its UI display fallback. */
type CombinedPostSearchResult = Pick<
  Post,
  'id' | 'post_type' | 'declared_language' | 'lingua_rs_detected_language'
> & {
  title: string
  authored_title: string | null
}

export type CommandSearchPost = FullPostSearchResult | CombinedPostSearchResult

export const EMPTY_RESULTS: SearchResults = {
  topics: [],
  posts: [],
  news: [],
  domains: [],
  communities: [],
  fediverse: [],
}

export async function searchByTab(
  q: string,
  tab: SearchTab,
  signal: AbortSignal,
): Promise<SearchResults> {
  switch (tab) {
    case 'topics':
      return searchTopicsOnly(q, signal)
    case 'communities':
      return searchCommunitiesOnly(q, signal)
    case 'posts':
      return searchPostsOnly(q, signal)
    case 'news':
      return searchNewsOnly(q, signal)
    case 'domains':
      return searchDomainsOnly(q, signal)
    case 'fediverse':
      return searchFediverseOnly(q, signal)
    case 'pages':
      return EMPTY_RESULTS
    default:
      return searchAll(q, signal)
  }
}

export function getPostRoute(postType: string): string {
  const config = Object.values(postRouteConfigs).find(c =>
    c.postTypes?.includes(postType as PostType),
  )
  return config?.singularPath || 'post'
}

export function getMatchingShortcuts(
  t: Translator,
  q: string,
  isAdmin: boolean,
  isAuthenticated = false,
  featureFlags: Record<string, boolean> = {},
): PageShortcut[] {
  const trimmed = q.trim().toLowerCase()
  if (!trimmed) return []

  return DERIVED_PAGE_SHORTCUTS.filter(s => {
    // Bucket gate
    if (s.bucket === 'admin' && !isAdmin) return false
    if (s.bucket === 'authenticated' && !isAuthenticated && !isAdmin) return false
    // Feature-flag gate
    if (s.featureFlag && featureFlags[s.featureFlag] !== true) return false
    // Query match (label OR href)
    return t(s.label).toLowerCase().includes(trimmed) || s.href.toLowerCase().includes(trimmed)
  })
    .slice(0, 5)
    .map(({ label, href, dataPw }) => ({ label, href, dataPw }))
}
