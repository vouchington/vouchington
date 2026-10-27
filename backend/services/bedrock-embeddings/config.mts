import { NOVA_EMBEDDING_DEFAULTS } from '@vouchington/utils/bedrock-embeddings'

export const EMBEDDINGS_TABLE = 'bedrock_nova_multimodal_v1_embeddings'

export const EMBEDDING_COLUMNS = {
  content_sha256: 'bedrock_nova_multimodal_v1_content_sha256',
  input_sha256: 'bedrock_nova_multimodal_v1_input_sha256',
  embedding: 'bedrock_nova_multimodal_v1_embedding',
  created_at: 'bedrock_nova_multimodal_v1_embedding_created_at',
  input_token_count: 'bedrock_nova_multimodal_v1_input_token_count',
} as const

export const EMBEDDING_DIMENSION = NOVA_EMBEDDING_DEFAULTS.dimension
export const BEDROCK_NOVA_MULTIMODAL_MODEL_ID = NOVA_EMBEDDING_DEFAULTS.modelId
export const BEDROCK_NOVA_MULTIMODAL_MODEL_NAME = 'nova-2-multimodal-embeddings-v1'

export const EMBEDDING_TABLES = ['topics', 'posts', 'rss_feed_items', 'crawl_chunks'] as const

export const TABLE_MAP = {
  post: 'posts',
  topic: 'topics',
  rss_feed_item: 'rss_feed_items',
  crawl_chunk: 'crawl_chunks',
} as const
