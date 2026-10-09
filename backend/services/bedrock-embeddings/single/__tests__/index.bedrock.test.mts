import { describe, expect, it } from 'vitest'
import { EMBEDDING_DIMENSION } from '../../config.mts'
import { createBedrockEmbedding } from '../request.mts'

describe('Bedrock Nova multimodal embeddings', () => {
  /**
   * Non-gating smoke check of the Nova embeddings model against the live Bedrock API.
   * The request we build, response parsing and the failure policy are gated by recorded responses in
   * backend/services/bedrock-embeddings/single/request.replay.no-data.mock.test.mts.
   * See docs/development/tests.md#live-provider-smoke-checks.
   */

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
