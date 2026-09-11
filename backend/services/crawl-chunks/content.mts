import type { Chunk } from '@jongleberry/vurst-markdown'
import { sha256 } from '@modules/utils'

export const createCrawlChunkEmbeddingContent = (chunk: Chunk) => {
  const content = [chunk.breadcrumb, chunk.text].filter(Boolean).join('\n\n')
  return {
    content,
    content_sha256: sha256(content),
  }
}
