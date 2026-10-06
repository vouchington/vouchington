import type { PublicContentProvenance, StaffContentProvenance } from './content-provenance.mts'

export type ListVisibility = 'private' | 'unlisted' | 'public'

export type ListItemType = 'rss_feed_item' | 'post'

export type List = {
  __entity_type: 'list'
  id: string
  owner_user_id: string
  name: string
  description: string | null
  visibility: ListVisibility
  created_at: Date
  updated_at: Date
  removed_at: Date | null
  // Attached per request after the cache read, never stored on the cached list or in a view.
  provenance?: PublicContentProvenance
  staff_provenance?: StaffContentProvenance
}

export type ListItem = {
  __entity_type: 'list_item'
  id: string
  list_id: string
  item_type: ListItemType
  entity_id: string
  order_index: number
  created_at: Date
  media_type: string | null
}
