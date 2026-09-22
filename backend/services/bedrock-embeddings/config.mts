// Amazon Nova multimodal embeddings reject text.value longer than this (UTF-16 code units).
export const MAX_EMBEDDING_TEXT_LENGTH = 50000

// Slice to the limit, then back up to the last whitespace so we don't cut mid-word.
// Also strips a trailing high surrogate that would otherwise produce an unpaired surrogate.
// Falls back to a hard slice when the head has no whitespace (one oversized token).
export const truncateEmbeddingText = (text: string): string => {
  if (text.length <= MAX_EMBEDDING_TEXT_LENGTH) return text
  let sliced = text.slice(0, MAX_EMBEDDING_TEXT_LENGTH)
  // A high surrogate (U+D800–U+DBFF) at the end means we split a surrogate pair.
  const lastCharCode = sliced.charCodeAt(sliced.length - 1)
  if (lastCharCode >= 0xd800 && lastCharCode <= 0xdbff) {
    sliced = sliced.slice(0, -1)
  }
  const lastWhitespace = sliced.search(/\s\S*$/)
  return lastWhitespace > 0 ? sliced.slice(0, lastWhitespace) : sliced
}

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
