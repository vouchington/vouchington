import { describe, expect, it } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
import { createEmbeddingCacheApplicationFixture } from '@voucha/test-helpers/embedding-cache-application'
import { applySingleEmbedding } from './apply.mts'

describe('captured single embedding application', () => {
  it.each([
    { cachedTokens: 4, sameInput: false, changedContent: false, expectedTokens: 4 },
    { cachedTokens: null, sameInput: true, changedContent: false, expectedTokens: 7 },
    { cachedTokens: null, sameInput: false, changedContent: false, expectedTokens: null },
    { cachedTokens: 4, sameInput: false, changedContent: true, expectedTokens: 7 },
  ])(
    'survives cache eviction while preserving content and token provenance ($cachedTokens, $sameInput, $changedContent)',
    async ({ cachedTokens, sameInput, changedContent, expectedTokens }) => {
      await using query = await beginTransaction()
      const fixture = await createEmbeddingCacheApplicationFixture(query, {
        cachedTokens,
        sameInput,
        changedContent,
      })
      expect(await fixture.evict()).toBe(1)

      await applySingleEmbedding(fixture.target, fixture.contentSha256, fixture.captured, query)

      expect(await fixture.state()).toEqual({
        cacheExists: false,
        inputSha256: changedContent ? fixture.oldInputSha256 : fixture.contentSha256,
        embedding: new Array(1024).fill(changedContent ? 0.125 : 0.25),
        tokens: expectedTokens,
      })
    },
  )
})
