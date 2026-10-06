import { describe, expect, it } from 'vitest'
import { EMBEDDING_DIMENSION } from '../../config.mts'
import { createBedrockEmbedding } from '../request.mts'

describe('Bedrock Nova multimodal embeddings', () => {
  it(
    'returns a 1024-dimensional text embedding from the real Bedrock API',
    { timeout: 30_000 },
    /* no-mistakes: integration=bedrock */
    async () => {
      const result = await createBedrockEmbedding('A concise semantic embedding smoke test.', {
        entityType: 'search',
      })

      expect(result.embedding).toHaveLength(EMBEDDING_DIMENSION)
      expect(result.embedding.every(value => Number.isFinite(value))).toBe(true)
      expect(result.tokens === null || result.tokens >= 0).toBe(true)
    },
  )
})
