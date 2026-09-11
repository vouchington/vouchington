export type Story = {
  id: string
  title: string | null
  cluster_reason: string | null
  published_at: Date | null
  official_rss_feed_item_id: string | null
  official_locked_at: Date | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export type StoryWithItemCount = Story & {
  item_count: number
}

export type PostStory = {
  post_id: string
  story_id: string
  initiated_by_id: string
  created_at: Date
}

export type StoryClusterCandidateRow = {
  id: string
  story_id: string | null
  story_published_at: Date | null
  distance: number
}
