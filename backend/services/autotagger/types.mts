export type PostAutotagResult = {
  post_id: string
  prompt_id: string
  content_sha256: Buffer
  topics_added: string[]
  created_at: Date
}

export type RssFeedItemAutotagResult = {
  id: string
  rss_feed_item_id: string
  content_sha256: Buffer
  prompt_id: string
  topics_added: string[]
  created_at: Date
}
