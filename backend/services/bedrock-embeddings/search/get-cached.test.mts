import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { pollUntilNotNull } from '@voucha/test-helpers'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { EMBEDDINGS_TABLE } from '../config.mts'
import * as bedrockRequest from '../single/request.mts'
import { getCachedSearchEmbedding } from './get-cached.mts'

const cacheProbe = new ValkeyCache<string>({
  prefix: `${EMBEDDINGS_TABLE}_search_embeddings`,
  ttlSeconds: 60 * 60 * 24,
  mode: 'json',
  staleRefresh: false,
  keySerializer: query => createHash('sha256').update(query).digest('hex'),
})

describe('getCachedSearchEmbedding', () => {
  it('bounds the Bedrock search request to six seconds', async () => {
    const embedding = Array.from({ length: 1024 }, (_, index) => index)
    const request = vi
      .spyOn(bedrockRequest, 'createBedrockEmbedding')
      .mockResolvedValue({ embedding, tokens: 5 })
    const abortSignal = new AbortController().signal
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(abortSignal)
    const query = `bounded-search-${Date.now()}-${Math.random().toString(36).slice(2)}`

    await expect(getCachedSearchEmbedding(query)).resolves.toEqual(embedding)

    expect(timeout).toHaveBeenCalledExactlyOnceWith(6_000)
    expect(request).toHaveBeenCalledExactlyOnceWith(query, {
      entityType: 'search',
      abortSignal,
    })
    request.mockRestore()
    timeout.mockRestore()
  })

  it('normalizes input and caches equivalent queries after one Bedrock request', async () => {
    const embedding = Array.from({ length: 1024 }, (_, index) => index)
    const request = vi
      .spyOn(bedrockRequest, 'createBedrockEmbedding')
      .mockResolvedValue({ embedding, tokens: 5 })
    const query = `cache-${Date.now()}-${Math.random().toString(36).slice(2)}`

    await expect(getCachedSearchEmbedding(`  ${query.toUpperCase()}  `)).resolves.toEqual(embedding)
    expect(request).toHaveBeenCalledExactlyOnceWith(
      query,
      expect.objectContaining({ entityType: 'search' }),
    )

    await expect(pollUntilNotNull(() => cacheProbe.get(query))).resolves.toEqual(embedding)
    await expect(getCachedSearchEmbedding(query)).resolves.toEqual(embedding)
    expect(request).toHaveBeenCalledOnce()
    request.mockRestore()
  })
})
