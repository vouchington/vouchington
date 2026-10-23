import { write } from '@data-stores/psql'
import { STORY_POST_RELATED_URL_PROJECTION_SEED } from './story-post-related-url-projection.mts'

/** Lease-heavy backlog makes the claim probe measure skipped rows, not just the first job. */
export async function seedStoryClaim3511(): Promise<void> {
  console.log('Seeding 10000 story projection jobs with sparse available claims...')
  await write(
    `/* seedStoryClaim3511 */
    WITH source_posts AS (
      SELECT id, row_number() OVER (ORDER BY id) AS ordinal
      FROM posts
      ORDER BY id LIMIT 10000
    )
    INSERT INTO story_post_related_url_projection_jobs
      (post_id, story_id, last_claimed_at, lease_token, leased_at, lease_expires_at)
    SELECT id, $1::uuid, NOW() - INTERVAL '2 days',
      CASE WHEN ordinal % 100 = 0 THEN NULL ELSE uuidv7() END,
      CASE WHEN ordinal % 100 = 0 THEN NULL ELSE NOW() END,
      CASE WHEN ordinal % 100 = 0 THEN NULL ELSE NOW() + INTERVAL '2 days' END
    FROM source_posts ON CONFLICT DO NOTHING`,
    [STORY_POST_RELATED_URL_PROJECTION_SEED.storyId],
  )
}
