import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

// getTrendingCommunities' candidate_reviewed_posts CTE requires a real, approved
// community_post_reviews row AND a matching posts.community_id — but seedCommunities' bulk
// insert only ever sets community_post_reviews.community_id, leaving posts.community_id NULL
// except for the two rows seedCommunityPosts() targets. Left as-is, only one seed community would
// ever have windowed post activity, giving the trending-communities EXPLAIN scenario a
// single-candidate plan that can't tell a candidate-bounded join from an accidental one.
//
// This used to be fixed by pairing posts.community_id with every one of seedCommunities' 1000
// approved reviews (post indices 0-999). That broke the 'post-feed' and other time_range: '1w'
// EXPLAIN scenarios in real CI (not a local-DB artifact — reproduced on a fresh per-run Postgres
// container): postSeedTimestampMs spaces posts one minute apart counting DOWN from "now", so
// indices 0-999 are the 1000 MOST RECENT posts in the whole dataset, squarely inside every 1-week
// feed window — and getPostFeedIds' eligible_posts CTE unconditionally requires
// posts.community_id IS NULL (backend/services/feeds/posts/get-ids/eligible-posts-cte.mts).
// Seed a dedicated batch of reviewed community posts instead, offset far enough into the past to
// clear every 1-week feed window while staying inside TRENDING_WINDOW_DAYS (30 days,
// backend/services/trending-communities/get-trending-communities.mts) — real trending-communities
// candidates that are never candidates for the general feed.
//
// postsPerCommunity used to be throttled to 20 (from a realistic 200) because
// view_public_post_eligibility's `eligible_root_posts` was a top-level `WITH ... NOT
// MATERIALIZED` CTE plus two UNION ALL branches: a subquery carrying a non-empty cteList fails
// is_simple_subquery()/is_simple_union_all() in the planner, so the view could not be pulled up
// and eligibility.post_id = p.id re-scanned the entire posts table once per community-tagged
// candidate post instead of once total (confirmed via EXPLAIN ANALYZE: 200 candidate posts
// against ~100k total posts took 8.25s for a single community). That was a real, pre-existing
// production defect in the view, independent of this seed — tracked in
// https://github.com/jonathanong/filaments/issues/10785. The fix flattened the view into a single
// CTE-free, UNION-free SELECT so it pulls up and eligibility.post_id = p.id collapses into an
// ordinary equijoin, so postsPerCommunity is back to a realistic 200: `plan-search-communities-
// gate.mts` holds the search-communities* scenarios to indexed-only posts access at this volume.
const TRENDING_CANDIDATE_POST_INDEX_OFFSET = 20_000

export async function seedTrendingCommunityPostIds(
  communityCount = 5,
  postsPerCommunity = 200,
): Promise<void> {
  const total = communityCount * postsPerCommunity
  console.log(`Seeding ${total} reviewed community posts outside the feed's time-range window...`)
  const createdById = seedUuid(0, '01')
  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let i = 0; i < total; i += 500) {
      const batch = Math.min(500, total - i)
      const reviewValues: unknown[] = []
      const reviewRows: string[] = []
      const postIdsByCommunity = new Map<string, string[]>()
      for (let j = 0; j < batch; j++) {
        const idx = i + j
        const communityId = seedUuid(idx % communityCount, '14')
        const postId = seedUuid(TRENDING_CANDIDATE_POST_INDEX_OFFSET + idx, '05')
        reviewValues.push(communityId, postId, createdById)
        const base = reviewValues.length - 2
        reviewRows.push(
          `($${base}, $${base + 1}, $${base + 2}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        )
        const postIds = postIdsByCommunity.get(communityId) ?? []
        postIds.push(postId)
        postIdsByCommunity.set(communityId, postIds)
      }
      await query(
        `/* seedExplainData */ INSERT INTO community_post_reviews
           (community_id, post_id, submitted_by_id, reviewed_at, approved_at)
         VALUES ${reviewRows.join(', ')} ON CONFLICT DO NOTHING`,
        reviewValues,
      )
      for (const [communityId, postIds] of postIdsByCommunity) {
        await query(
          `/* seedExplainData */ UPDATE posts SET community_id = $1 WHERE id = ANY($2::uuid[])`,
          [communityId, postIds],
        )
      }
    }

    await transaction.commit()
  }
}

// getTrendingCommunities' proxy_follow_counts/proxy_mute_counts CTEs are the only scenario
// consumers of these two relation tables — nothing else in explain-analyze seeds them.
export async function seedCommunityProxyFollowsAndMutes(
  communityCount = 5,
  usersPerCommunity = 40,
): Promise<void> {
  console.log(
    `Seeding proxy follow/mute relations for ${communityCount} communities (${usersPerCommunity} users each)...`,
  )
  {
    await using transaction = await beginTransaction()
    const query = transaction
    const followValues: unknown[] = []
    const followRows: string[] = []
    const muteValues: unknown[] = []
    const muteRows: string[] = []
    for (let i = 0; i < communityCount; i++) {
      const communityId = seedUuid(i, '14')
      for (let j = 0; j < usersPerCommunity; j++) {
        const userId = seedUuid(i * usersPerCommunity + j, '01')
        if (j % 2 === 0) {
          followValues.push(userId, communityId)
          const base = followValues.length - 1
          followRows.push(`($${base}, $${base + 1})`)
        } else {
          muteValues.push(userId, communityId)
          const base = muteValues.length - 1
          muteRows.push(`($${base}, $${base + 1})`)
        }
      }
    }
    if (followRows.length > 0) {
      await query(
        `/* seedExplainData */ INSERT INTO relation__user__proxy_follow__community (subject_id, object_id)
         VALUES ${followRows.join(', ')} ON CONFLICT DO NOTHING`,
        followValues,
      )
    }
    if (muteRows.length > 0) {
      await query(
        `/* seedExplainData */ INSERT INTO relation__user__proxy_mute__community (subject_id, object_id)
         VALUES ${muteRows.join(', ')} ON CONFLICT DO NOTHING`,
        muteValues,
      )
    }

    await transaction.commit()
  }
}
