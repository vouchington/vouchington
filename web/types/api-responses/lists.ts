import type * as Api from './shared'

type PageInfo = Api.PageInfo

export type List = {
  __entity_type: 'list'
  id: string
  owner_user_id: string
  name: string
  description: string | null
  visibility: 'private' | 'unlisted' | 'public'
  created_at: string
  updated_at: string
  removed_at: string | null
}

export type ListItem = {
  __entity_type: 'list_item'
  id: string
  list_id: string
  item_type: 'rss_feed_item' | 'post'
  entity_id: string
  order_index: number
  created_at: string
  media_type: string | null
}

export interface ListResponseBody {
  list: List
}

export interface ListsSearchResponseBody {
  results: Array<{ __entity_type: 'list'; id: string }>
  page_info: PageInfo
  lists: Record<string, List>
}

export interface ListItemsResponseBody {
  results: Array<{ __entity_type: 'list_item'; id: string }>
  page_info: PageInfo
  list_items: Record<string, ListItem>
}

export interface ListsContainingResponseBody {
  list_ids: string[]
}

export interface ReferenceListResponseBody<TResult> {
  results: TResult[]
  page_info: PageInfo
}
