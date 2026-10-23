import { truncateEmbeddingText as truncateText } from '@vouchington/utils/bedrock-embeddings'
// Nova's inline text.value cap; UTF-16 slicing preserves the existing truncation contract.
// https://docs.aws.amazon.com/nova/latest/userguide/embeddings-schema.html
export const MAX_EMBEDDING_TEXT_LENGTH = 8_192

// Nova documents no input token count. This character-based accounting estimate is approximate;
// replace it only after a captured response establishes a reliable usage source (#2874).
export const NOVA_EMBEDDING_CHARACTERS_PER_TOKEN = 4

export const truncateEmbeddingText = (text: string): string =>
  truncateText(text, MAX_EMBEDDING_TEXT_LENGTH)

export const EMBEDDINGS_TABLE = 'bedrock_nova_multimodal_v1_embeddings'

export const EMBEDDING_COLUMNS = {
  content_sha256: 'bedrock_nova_multimodal_v1_content_sha256',
  input_sha256: 'bedrock_nova_multimodal_v1_input_sha256',
  embedding: 'bedrock_nova_multimodal_v1_embedding',
  created_at: 'bedrock_nova_multimodal_v1_embedding_created_at',
  input_token_count: 'bedrock_nova_multimodal_v1_input_token_count',
} as const

export const IMAGE_EMBEDDINGS_TABLE = 'bedrock_nova_multimodal_v1_image_embeddings'

export const EMBEDDING_DIMENSION = 1024
export const BEDROCK_NOVA_MULTIMODAL_MODEL_ID = 'amazon.nova-2-multimodal-embeddings-v1:0'
export const BEDROCK_NOVA_MULTIMODAL_MODEL_NAME = 'nova-2-multimodal-embeddings-v1'

export const EMBEDDING_TABLES = ['topics', 'posts', 'rss_feed_items', 'crawl_chunks'] as const

export const TABLE_MAP = {
  post: 'posts',
  topic: 'topics',
  rss_feed_item: 'rss_feed_items',
  crawl_chunk: 'crawl_chunks',
} as const
