import { write } from '@data-stores/psql'

/** Earlier-type claims exclude the first raw referral pages without deleting admission rows. */
export async function seedMailSelection3511(): Promise<void> {
  await write(`/* seedMailSelection3511 */
    WITH first_referral_candidates AS MATERIALIZED (
      SELECT user_id FROM user_engagement_email_candidates
      WHERE email_type = 'post_referral_link' AND claimed_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_engagement_email_sends send
          WHERE send.user_id = user_engagement_email_candidates.user_id
            AND send.email_type = 'follow_topics'
        )
      ORDER BY user_id LIMIT 1000
    )
    INSERT INTO user_engagement_email_sends (user_id, email_type)
    SELECT user_id, 'follow_topics' FROM first_referral_candidates
    ON CONFLICT (user_id, email_type) DO NOTHING`)
}
