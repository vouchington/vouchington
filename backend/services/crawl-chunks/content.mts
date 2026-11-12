import type { Chunk } from '@jongleberry/vurst-markdown'
import { createEmbeddingDocumentHash } from '@voucha/types/embedding-content'

export const createCrawlChunkEmbeddingContent = (chunk: Chunk) => {
  const content = [chunk.breadcrumb, chunk.text].filter(Boolean).join('\n\n')
  return {
    content,
    content_sha256: createEmbeddingDocumentHash(content),
  }
}
