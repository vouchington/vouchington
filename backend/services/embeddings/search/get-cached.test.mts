import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import { getCachedSearchEmbedding } from './get-cached.mts'

const embedding = new Array(1536).fill(0.125)

describe('cached Vertex query embeddings', () => {
  afterEach(() => vi.restoreAllMocks())
  it('bounds the entire user-waiting embedding operation to six seconds', async () => {
    const fixture = createVertexHttpFixture()
    const received = fixture.embeddingResponse(embedding, 5)
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    await fixture.run(async () => {
      await expect(getCachedSearchEmbedding(`bounded-${crypto.randomUUID()}`)).resolves.toEqual(
        embedding,
      )
    })
    expect(timeout).toHaveBeenCalledWith(6000)
    expect(received).toHaveBeenCalledOnce()
  })
  it('normalizes equivalent queries and serves one paid HTTP request', async () => {
    const fixture = createVertexHttpFixture()
    const received = fixture.embeddingResponse(embedding, 5)
    const query = `cache-${crypto.randomUUID()}`
    await fixture.run(async () => {
      expect(await getCachedSearchEmbedding(`  ${query.toUpperCase()}  `)).toEqual(embedding)
      expect(await getCachedSearchEmbedding(query)).toEqual(embedding)
    })
    expect(received).toHaveBeenCalledOnce()
  })
})
