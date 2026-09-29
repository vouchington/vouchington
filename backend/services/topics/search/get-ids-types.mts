export type TopicSearchRow = {
  id: string
  name: string
  slug: string
  topic_type: string
  created_at?: string | Date | null
  sort_score?: string | number
  relevance_tier?: number
  ranking_score?: string | number
}
