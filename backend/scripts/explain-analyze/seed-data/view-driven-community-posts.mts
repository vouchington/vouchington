import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

// These posts sit outside the one-week general-feed window. Keep the trending-community
// cohort intact while giving the community pages a full page and excluded review states.
export async function seedViewDrivenCommunityPosts(): Promise<void> {
  const communityId = seedUuid(0, '14')
  const submittedById = seedUuid(0, '01')
  const postIds = Array.from({ length: 50 }, (_, i) => seedUuid(22_000 + i, '05'))
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedViewDrivenCommunityPosts */ UPDATE posts SET community_id = $1
     WHERE id = ANY($2::uuid[])`,
    [communityId, postIds],
  )
  await transaction(
    `/* seedViewDrivenCommunityPosts */ INSERT INTO community_post_reviews
       (community_id, post_id, submitted_by_id, reviewed_at, approved_at, rejected_at, unpublished_at)
     SELECT $1::uuid, seeded.post_id, $2::uuid,
       CASE WHEN seeded.ordinal > 30 THEN CURRENT_TIMESTAMP END,
       CASE WHEN seeded.ordinal > 40 THEN CURRENT_TIMESTAMP END,
       CASE WHEN seeded.ordinal > 30 AND seeded.ordinal <= 40 THEN CURRENT_TIMESTAMP END,
       CASE WHEN seeded.ordinal > 40 THEN CURRENT_TIMESTAMP END
     FROM unnest($3::uuid[]) WITH ORDINALITY AS seeded(post_id, ordinal)
     ON CONFLICT (post_id) DO NOTHING`,
    [communityId, submittedById, postIds],
  )
  await transaction.commit()
}
