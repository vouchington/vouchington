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

export type CuratedAsideItem = {
  id: string
  aside_type: CuratedAsideType
  entity_id: string
  position: number
  created_by_id: string | null
  created_at: Date
  entity_data: CuratedAsideEntityData | null
}
