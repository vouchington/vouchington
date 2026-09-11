import { createHash } from 'node:crypto'
import type { TransactionQuery } from '@data-stores/psql'
export function sha256(content: string): Buffer {
  return createHash('sha256').update(content).digest()
}
export function buildEmbeddingVector(primary: number, jitter: number = 0): string {
  const vec = new Float32Array(1024)
  vec[primary] = 0.95
  vec[(primary + 1) % 1024] = 0.05 + jitter * 0.01
  let norm = 0
  for (const value of vec) norm += value * value
  norm = Math.sqrt(norm)
  for (let i = 0; i < vec.length; i++) vec[i] /= norm
  return `[${Array.from(vec).join(',')}]`
}
export async function approveSeedPosts(query: TransactionQuery, postIds: string[]): Promise<void> {
  if (postIds.length === 0) return
  await query(
    `/* approveSeedPosts */ WITH seed_posts AS ( SELECT UNNEST($1::uuid[]) AS post_id ), inserted_change AS ( INSERT INTO post_clearance_changes (post_id, change_type, metadata) SELECT seed_posts.post_id, 'approve', '{"source":"playwright-seed"}'::jsonb FROM seed_posts JOIN posts ON posts.id = seed_posts.post_id WHERE posts.approved_at IS NULL RETURNING id, post_id, created_at ) UPDATE posts SET latest_clearance_change_id = inserted_change.id, approved_at = inserted_change.created_at, rejected_at = NULL, in_review_at = NULL FROM inserted_change WHERE posts.id = inserted_change.post_id`,
    [postIds],
  )
}

export async function markSeedPostsMarkdownVisible(
  query: TransactionQuery,
  postIds: string[],
): Promise<void> {
  if (postIds.length === 0) return
  await query(
    `/* markSeedPostsMarkdownVisible */ UPDATE posts SET votes_score_up = GREATEST(votes_score_up, 1), votes_count_up = GREATEST(votes_count_up, 1) WHERE id = ANY($1::uuid[])`,
    [postIds],
  )
}
