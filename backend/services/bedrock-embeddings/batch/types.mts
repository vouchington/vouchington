export type BatchJobType = 'topics' | 'posts' | 'rss_feed_items' | 'crawl_chunks' | 'images'
export type BatchUpdateItem = {
  entity_id: string
  content_sha256: Buffer
  embedding: number[]
  input_token_count: number | null
}

export type ImageBatchUpdateItem = {
  entity_id: string
  image_sha_256: Buffer
  embedding: number[]
}
