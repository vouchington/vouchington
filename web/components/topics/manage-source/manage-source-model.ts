import type { TopicAdditionalHostname } from '@/lib/api/client/topic-additional-hostnames'
import type { PageInfo } from '@/types/api-responses'
import type { RssFeedCrawlSummary } from '@/types/rss-feeds'
import { dedupeBy } from '@ts-shared/utils/collections'

export interface ViewUrl {
  url: string
}

export type ManageSourceRssFeed = {
  id: string
  title: string | null
  rss_feed_url: ViewUrl
  home_page_url: ViewUrl | null
  is_enabled: boolean
  is_discoverable: boolean
  last_fetched_at: string | null
  etag: string | null
  last_modified_at: string | null
}

export interface TopicHostname {
  id: string
  hostname: string
}

export interface ManageSourceState {
  additionalHostnames: TopicAdditionalHostname[]
  additionalHostnamesPageInfo: Pick<PageInfo, 'has_next_page' | 'end_cursor'>
  addingHostname: boolean
  confirmDelete: boolean
  crawls: RssFeedCrawlSummary[]
  deleting: boolean
  hostnamesFetchError: Error | null
  loadError: string | null
  loading: boolean
  loadingMoreHostnames: boolean
  primaryHostname: TopicHostname | null
  primaryHostnameSaving: boolean
  refreshing: boolean
  removingHostnameId: string | null
  rssFeed: ManageSourceRssFeed | null
  saving: boolean
  toggling: boolean
  togglingDiscoverability: boolean
  topicName: string | null
}

export const initialManageSourceState: ManageSourceState = {
  additionalHostnames: [],
  additionalHostnamesPageInfo: { has_next_page: false, end_cursor: null },
  addingHostname: false,
  confirmDelete: false,
  crawls: [],
  deleting: false,
  hostnamesFetchError: null,
  loadError: null,
  loading: true,
  loadingMoreHostnames: false,
  primaryHostname: null,
  primaryHostnameSaving: false,
  refreshing: false,
  removingHostnameId: null,
  rssFeed: null,
  saving: false,
  toggling: false,
  togglingDiscoverability: false,
  topicName: null,
}

export function toHostnamesPageInfo(
  pageInfo: PageInfo,
): Pick<PageInfo, 'has_next_page' | 'end_cursor'> {
  return { has_next_page: pageInfo.has_next_page, end_cursor: pageInfo.end_cursor }
}

export type ManageSourceAction =
  | Partial<ManageSourceState>
  | {
      type: 'append-additional-hostnames'
      hostnames: TopicAdditionalHostname[]
      pageInfo: ManageSourceState['additionalHostnamesPageInfo']
    }

export function manageSourceReducer(
  state: ManageSourceState,
  action: ManageSourceAction,
): ManageSourceState {
  if ('type' in action && action.type === 'append-additional-hostnames') {
    return {
      ...state,
      additionalHostnames: dedupeBy(
        [...state.additionalHostnames, ...action.hostnames],
        h => h.hostname_id,
      ),
      additionalHostnamesPageInfo: action.pageInfo,
    }
  }
  return { ...state, ...action }
}

export function toPrimaryHostname(topicData: {
  hostname?: unknown
  hostname_id?: string | null
}): TopicHostname | null {
  if (!topicData.hostname_id) return null
  const hostname = topicData.hostname as TopicHostname | null
  return {
    id: topicData.hostname_id,
    hostname: hostname?.hostname ?? '',
  }
}
