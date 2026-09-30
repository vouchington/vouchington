import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type PostClassifierLocalOutcomeFacts = {
  run_id: string
  local_topic_id: string
  flagged: boolean
  reason: string
  confidence_score: number
  confidence_threshold: number
  classification: string
  detector: string
  detector_model_version: string
}

export async function setPostClassifierPostHashForTest(
  postId: string,
  hash: Buffer,
): Promise<void> {
  await write(sql`/* setPostClassifierPostHashForTest */
    UPDATE posts SET llm_moderation_content_sha256 = ${hash} WHERE id = ${postId}
  `)
}

/** The moderation content hash that fences the classifier runs of one post. */
export async function getPostClassifierPostHashForTest(postId: string): Promise<Buffer> {
  const { rows } = await write<{ hash: Buffer }>(sql`/* getPostClassifierPostHashForTest */
    SELECT llm_moderation_content_sha256 AS hash FROM posts WHERE id = ${postId}
  `)
  if (!rows[0]) throw new Error(`Post not found: ${postId}`)
  return rows[0].hash
}

/** The retained C5 local detector outcome of one run, or null when the run kept none. */
export async function getPostClassifierLocalOutcomeFacts(
  runId: string,
): Promise<PostClassifierLocalOutcomeFacts | null> {
  const { rows } = await write<PostClassifierLocalOutcomeFacts>(sql`
    /* getPostClassifierLocalOutcomeFacts */
    SELECT run_id, local_topic_id, flagged, reason, confidence_score, confidence_threshold,
      classification, detector, detector_model_version
    FROM post_classifier_local_outcomes WHERE run_id = ${runId}
  `)
  return rows[0] ?? null
}
