export type CuratedAsideType = 'topic' | 'source' | 'community'

export type CuratedAsideEntityData =
  | {
      entity_type: 'topic'
      id: string
      name: string
      slug: string
      topic_type: string
    }
  | {
      entity_type: 'source'
      id: string
      title: string
      rss_feed_url: string
      home_page_url: string | null
      topic_name: string
    }
  | {
      entity_type: 'community'
      id: string
      name: string
      slug: string
    }

export interface CuratedAsideItem {
  id: string
  aside_type: CuratedAsideType
  entity_id: string
  position: number
  created_by_id: string | null
  created_at: string
  entity_data: CuratedAsideEntityData | null
}

export interface CuratedAsideItemsResponse {
  curated_aside_items: CuratedAsideItem[]
}

export interface CuratedAsideItemResponse {
  curated_aside_item: CuratedAsideItem
}
