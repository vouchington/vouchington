/**
 * Generates a random unit vector (default 1024-dim).
 * Two independently generated random unit vectors have essentially 0 cosine similarity,
 * making them safe to use across test runs (the DB is never cleaned between runs).
 */
export function makeRandomEmbedding(length = 1024): number[] {
  return normalize(Array.from({ length }, () => Math.random() - 0.5))
}

/**
 * Generates a distinct unit vector at cosine distance ≈ scale²/2 from `base` (≈ 0.00125 for the
 * default scale, vs ≈ 1.0 between unrelated random vectors). Use one per fixture row when a test
 * asserts the row ranks in ANN (`<=>`-ordered) results for a `base` query vector: storing the
 * identical vector on many rows builds a degenerate HNSW cluster whose graph reachability can
 * fail, dropping every fixture from results at once (issue #6781).
 */
export function makeNearbyEmbedding(base: number[], scale = 0.05): number[] {
  const noise = makeRandomEmbedding(base.length)
  return normalize(base.map((x, i) => x + scale * noise[i]))
}

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  return v.map(x => x / norm)
}
