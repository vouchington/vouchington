import { describe, it, expect, beforeAll } from 'vitest'
import { checkEmbeddingsSimilarity } from '../duplicate-signals.mts'
import {
  createTestUser,
  insertTestPost,
  addDummyEmbeddingToPost,
  makeNearbyEmbedding,
  safeUsername,
} from '@voucha/test-helpers'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'

const DAY_MS = 86_400_000

/** A post id minted far outside every lookback ceiling, unique per call. */
const oldPostId = () =>
  getMinUUIDv7ForDate(new Date(Date.now() - 400 * DAY_MS - Math.random() * 1e8))

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

/**
 * Generates a random unit vector in 1024-dim space.
 * Two independently generated random unit vectors have essentially 0 cosine similarity,
 * making them safe to use across test runs (the DB is never cleaned between runs).
 */
function makeRandomUnitVector(): number[] {
  const v = Array.from({ length: 1024 }, () => Math.random() - 0.5)
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  return v.map(x => x / norm)
}

describe('checkEmbeddingsSimilarity', () => {
  let userId1: string
  let userId2: string
  // Unique random embeddings per test run — isolates each run from leftover DB rows
  let crossUserEmbedding: number[]
  let sameUserEmbedding: number[]
  let dissimilarEmbA: number[]
  let dissimilarEmbB: number[]

  beforeAll(async () => {
    const u1 = await createTestUser({ username: safeUsername('emb-sim-u1') })
    const u2 = await createTestUser({ username: safeUsername('emb-sim-u2') })
    userId1 = u1!.id
    userId2 = u2!.id
    crossUserEmbedding = makeRandomUnitVector()
    sameUserEmbedding = makeRandomUnitVector()
    dissimilarEmbA = makeRandomUnitVector()
    dissimilarEmbB = makeRandomUnitVector()
  })

  it('post without embedding — not flagged (best-effort)', async () => {
    const suffix = randomSuffix()
    const postId = await insertTestPost({
      title: `No embedding ${suffix}`,
      slug: `no-embedding-${suffix}`,
      createdById: userId1,
      markdown: 'no embedding test',
    })

    const result = await checkEmbeddingsSimilarity(postId, userId1)
    expect(result.flagged).toBe(false)
    expect(result.score).toBe(0)
  })

  it('similar post from different user — flagged', async () => {
    const suffix = randomSuffix()

    const post1Id = await insertTestPost({
      title: `Similar post 1 ${suffix}`,
      slug: `similar-1-${suffix}`,
      createdById: userId1,
      markdown: 'similar content',
    })
    const post2Id = await insertTestPost({
      title: `Similar post 2 ${suffix}`,
      slug: `similar-2-${suffix}`,
      createdById: userId2,
      markdown: 'similar content',
    })

    // Both posts get nearby embeddings around the same base vector.
    await addDummyEmbeddingToPost(post1Id, {
      embedding: makeNearbyEmbedding(crossUserEmbedding, 0.01),
    })
    await addDummyEmbeddingToPost(post2Id, {
      embedding: makeNearbyEmbedding(crossUserEmbedding, 0.01),
    })

    const result = await checkEmbeddingsSimilarity(post2Id, userId2)
    expect(result.flagged).toBe(true)
    expect(result.score).toBe(1.0)
  })

  it('similar post from same user — not flagged', async () => {
    const suffix = randomSuffix()

    const post1Id = await insertTestPost({
      title: `Same user emb 1 ${suffix}`,
      slug: `same-user-emb-1-${suffix}`,
      createdById: userId1,
      markdown: 'same user content',
    })
    const post2Id = await insertTestPost({
      title: `Same user emb 2 ${suffix}`,
      slug: `same-user-emb-2-${suffix}`,
      createdById: userId1,
      markdown: 'same user content',
    })

    // Both posts are by userId1, with nearby embeddings around the same base vector.
    await addDummyEmbeddingToPost(post1Id, {
      embedding: makeNearbyEmbedding(sameUserEmbedding, 0.01),
    })
    await addDummyEmbeddingToPost(post2Id, {
      embedding: makeNearbyEmbedding(sameUserEmbedding, 0.01),
    })

    // No cross-user match should be found
    const result = await checkEmbeddingsSimilarity(post2Id, userId1)
    expect(result.flagged).toBe(false)
  })

  it('dissimilar posts — not flagged', async () => {
    const suffix = randomSuffix()

    const post1Id = await insertTestPost({
      title: `Dissimilar 1 ${suffix}`,
      slug: `dissimilar-1-${suffix}`,
      createdById: userId1,
      markdown: 'dissimilar a',
    })
    const post2Id = await insertTestPost({
      title: `Dissimilar 2 ${suffix}`,
      slug: `dissimilar-2-${suffix}`,
      createdById: userId2,
      markdown: 'dissimilar b',
    })

    // Unique random embeddings per run — essentially 0 cosine similarity between them
    await addDummyEmbeddingToPost(post1Id, { embedding: dissimilarEmbA })
    await addDummyEmbeddingToPost(post2Id, { embedding: dissimilarEmbB })

    const result = await checkEmbeddingsSimilarity(post2Id, userId2)
    expect(result.flagged).toBe(false)
  })

  it('similar post from different user older than the lookback window — not flagged', async () => {
    const suffix = randomSuffix()
    const oldId = await insertTestPost({
      id: oldPostId(),
      title: `Old similar ${suffix}`,
      slug: `old-similar-${suffix}`,
      createdById: userId1,
      markdown: 'old similar content',
    })
    const newId = await insertTestPost({
      title: `New similar ${suffix}`,
      slug: `new-similar-${suffix}`,
      createdById: userId2,
      markdown: 'new similar content',
    })
    const base = makeRandomUnitVector()
    await addDummyEmbeddingToPost(oldId, { embedding: makeNearbyEmbedding(base, 0.01) })
    await addDummyEmbeddingToPost(newId, { embedding: makeNearbyEmbedding(base, 0.01) })

    const result = await checkEmbeddingsSimilarity(newId, userId2)
    expect(result.flagged).toBe(false)
  })

  it('candidate with a zero-norm embedding — not flagged', async () => {
    // A zero vector has NaN cosine distance to every probe; NaN must never pass the threshold.
    const suffix = randomSuffix()
    const zeroCandidateId = await insertTestPost({
      title: `Zero candidate ${suffix}`,
      slug: `zero-cand-${suffix}`,
      createdById: userId1,
      markdown: 'zero candidate',
    })
    const sourceId = await insertTestPost({
      title: `Normal source ${suffix}`,
      slug: `normal-src-${suffix}`,
      createdById: userId2,
      markdown: 'normal source',
    })
    await addDummyEmbeddingToPost(zeroCandidateId, { embedding: Array(1024).fill(0) as number[] })
    await addDummyEmbeddingToPost(sourceId, { embedding: makeRandomUnitVector() })

    const result = await checkEmbeddingsSimilarity(sourceId, userId2)
    expect(result.flagged).toBe(false)
  })

  it('source post with zero-norm embedding — not flagged', async () => {
    // Regression: zero-norm embeddings produce NaN cosine distances in pgvector.
    // PostgreSQL evaluates NaN >= threshold as true, causing false-positive spam flags.
    // The query guards against this with a self-distance = 0 check on the source post, and
    // the threshold compares distance (NaN never passes) for candidates.
    const suffix = randomSuffix()
    const zeroEmbedding = Array(1024).fill(0) as number[]

    // candidate post (userId1): normal valid embedding
    const candidateId = await insertTestPost({
      title: `Zero norm candidate ${suffix}`,
      slug: `zero-norm-cand-${suffix}`,
      createdById: userId1,
      markdown: 'zero norm candidate',
    })
    // source post (userId2): zero-norm embedding — must NOT produce a false positive
    const sourceId = await insertTestPost({
      title: `Zero norm source ${suffix}`,
      slug: `zero-norm-src-${suffix}`,
      createdById: userId2,
      markdown: 'zero norm source',
    })

    await addDummyEmbeddingToPost(candidateId, { embedding: dissimilarEmbA })
    await addDummyEmbeddingToPost(sourceId, { embedding: zeroEmbedding })

    const result = await checkEmbeddingsSimilarity(sourceId, userId2)
    expect(result.flagged).toBe(false)
  })

  it('query failure — falls back to the skipped result', async () => {
    const result = await checkEmbeddingsSimilarity('not-a-uuid', userId1)

    expect(result).toMatchObject({ flagged: false, details: { skipped: true } })
  })
})
