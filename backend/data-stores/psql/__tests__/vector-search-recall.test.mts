import { describe, it, expect } from 'vitest'
import {
  getSessionHnswEfSearch,
  makeNearbyEmbedding,
  makeRandomEmbedding,
  TEST_HNSW_EF_SEARCH,
} from '../test-helpers/vector-search-recall.mts'

describe('test-database vector search recall floor', () => {
  // Guards the raiseHnswEfSearchForTestDatabase() call in vitest.setup.data-stores.mts: without
  // it, `<=>`-ordered queries run with pgvector's default ef_search and tests that assert a
  // fixture ranks in ANN results become recall-dependent flakes (issue #6781).
  it('applies TEST_HNSW_EF_SEARCH to sessions opened by test workers', async () => {
    expect(await getSessionHnswEfSearch()).toBe(TEST_HNSW_EF_SEARCH)
  })
})

describe('makeNearbyEmbedding', () => {
  it('returns distinct unit vectors at near-zero cosine distance from the base', () => {
    const base = makeRandomEmbedding()
    const first = makeNearbyEmbedding(base)
    const second = makeNearbyEmbedding(base)

    expect(magnitude(first)).toBeCloseTo(1, 6)
    expect(cosineDistance(first, base)).toBeLessThan(0.01)
    // Distinct from the base and from sibling fixtures — identical vectors would rebuild the
    // degenerate HNSW cluster this helper exists to avoid.
    expect(cosineDistance(first, base)).toBeGreaterThan(0)
    expect(cosineDistance(first, second)).toBeGreaterThan(0)
  })

  it('follows the base vector dimension', () => {
    const base = makeRandomEmbedding(1536)
    const nearby = makeNearbyEmbedding(base)

    expect(nearby).toHaveLength(1536)
    expect(nearby.every(Number.isFinite)).toBe(true)
    expect(cosineDistance(nearby, base)).toBeLessThan(0.01)
  })
})

function magnitude(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0))
}

function cosineDistance(a: number[], b: number[]): number {
  const dot = a.reduce((sum, x, i) => sum + x * b[i], 0)
  return 1 - dot / (magnitude(a) * magnitude(b))
}
