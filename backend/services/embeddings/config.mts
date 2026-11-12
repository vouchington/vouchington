export const EMBEDDINGS_TABLE = 'gemini_embedding_2_embeddings'

export const EMBEDDING_COLUMNS = {
  content_sha256: 'gemini_embedding_2_content_sha256',
  input_sha256: 'gemini_embedding_2_input_sha256',
  embedding: 'gemini_embedding_2_embedding',
  created_at: 'gemini_embedding_2_embedding_created_at',
  input_token_count: 'gemini_embedding_2_input_token_count',
} as const

export const EMBEDDING_DIMENSION = 1536
export const GEMINI_EMBEDDING_2_MODEL_ID = 'gemini-embedding-2'
export const GEMINI_EMBEDDING_2_MODEL_NAME = 'gemini-embedding-2'

export const EMBEDDING_TABLES = ['topics', 'posts', 'rss_feed_items', 'crawl_chunks'] as const
