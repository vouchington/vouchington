import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { SpamDetectionResult } from './types.mts'

export async function applyPostSpamDetectionResults(
  postId: string,
  inputSha256: Buffer,
  result: SpamDetectionResult,
): Promise<boolean> {
  // Callers must pass the hash computed from the same primary-read post snapshot they analyzed.
  const { rows } = await write(sql`/* applyPostSpamDetectionResults */
    UPDATE posts
    SET
      spam_detection_flagged = ${result.flagged},
      spam_detection_created_at = NOW(),
      spam_detection_score = ${result.composite_score},
      spam_detection_results = ${JSON.stringify(result.signals)}::jsonb
    WHERE id = ${postId}
      AND llm_moderation_content_sha256 = ${inputSha256}
    RETURNING id
  `)
  return rows.length > 0
}
