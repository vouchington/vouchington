import sql from 'sql-template-strings'
import type { TransactionQuery } from '@data-stores/psql'

export async function clearFalsePositivePostLevelFlags(
  postId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* clearFalsePositivePostLevelFlags */
    UPDATE posts p
    SET openai_omni_moderation_flagged = CASE
          WHEN EXISTS (
            SELECT 1
            FROM moderation_training_feedbacks mtf
            WHERE mtf.post_id = p.id
              AND mtf.source_type = 'openai_omni'
              AND mtf.event_type = 'automod_reviewed'
              AND mtf.label = 'false_positive'
              AND mtf.input_sha256 IS NOT DISTINCT FROM p.openai_omni_moderation_input_sha256
          )
            THEN FALSE
          ELSE p.openai_omni_moderation_flagged
        END,
        spam_detection_flagged = CASE
          WHEN EXISTS (
            SELECT 1
            FROM moderation_training_feedbacks mtf
            WHERE mtf.post_id = p.id
              AND mtf.source_type = 'spam_detection'
              AND mtf.event_type = 'automod_reviewed'
              AND mtf.label = 'false_positive'
              AND mtf.input_sha256 IS NOT DISTINCT FROM p.llm_moderation_content_sha256
          )
            THEN FALSE
          ELSE p.spam_detection_flagged
        END
    WHERE p.id = ${postId}
  `)
}
