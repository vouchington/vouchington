import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const TRENDING_TEXT_MATCH_COUNT = 60
const NOISE_COUNT = 2_000
const MEMBERS_PER_MATCH = 500
const COMMUNITY_BASE = 900_000
const POST_BASE = 29_000

/** Real approved recent posts populate the ranking view; high-ranked matches fill one page. */
export async function seedCommunitySearchTrending(): Promise<void> {
  const communityIds = Array.from({ length: TRENDING_TEXT_MATCH_COUNT + NOISE_COUNT }, (_, index) =>
    seedUuid(COMMUNITY_BASE + index, '14'),
  )
  const postIds = communityIds.map((_, index) => seedUuid(POST_BASE + index, '05'))
  const ownerId = seedUuid(0, '01')
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedCommunitySearchTrending */ INSERT INTO communities
       (id, name, slug, created_by_id, created_via, visibility)
     SELECT id, CASE WHEN ordinal <= $3 THEN 'Explain trending ' ELSE 'Trending noise ' END || ordinal,
       'trending-search-fixture-' || ordinal, $2, 'system', 'public'
     FROM unnest($1::uuid[]) WITH ORDINALITY AS fixture(id, ordinal)
     ON CONFLICT DO NOTHING`,
    [communityIds, ownerId, TRENDING_TEXT_MATCH_COUNT],
  )
  await transaction(
    `/* seedCommunitySearchTrending */ UPDATE posts AS post
     SET community_id = fixture.community_id, approved_at = CURRENT_TIMESTAMP
     FROM unnest($1::uuid[], $2::uuid[]) AS fixture(post_id, community_id)
     WHERE post.id = fixture.post_id`,
    [postIds, communityIds],
  )
  await transaction(
    `/* seedCommunitySearchTrending */ INSERT INTO community_post_reviews
       (community_id, post_id, submitted_by_id, reviewed_at, approved_at)
     SELECT community_id, post_id, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     FROM unnest($1::uuid[], $2::uuid[]) AS fixture(community_id, post_id)
     ON CONFLICT DO NOTHING`,
    [communityIds, postIds, ownerId],
  )
  const memberCommunityIds = communityIds.slice(0, TRENDING_TEXT_MATCH_COUNT)
  const memberIds = Array.from({ length: MEMBERS_PER_MATCH }, (_, index) =>
    seedUuid(10_000 + index, '01'),
  )
  await transaction(
    `/* seedCommunitySearchTrending */ INSERT INTO community_members (community_id, user_id, role)
     SELECT community_id, user_id, 'member' FROM unnest($1::uuid[]) AS community(community_id)
     CROSS JOIN unnest($2::uuid[]) AS member(user_id) ON CONFLICT DO NOTHING`,
    [memberCommunityIds, memberIds],
  )
  await transaction.commit()
}
