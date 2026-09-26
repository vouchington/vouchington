import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export async function seedCommunities(communityCount = 5, pubsPerCommunity = 200): Promise<void> {
  console.log(
    `Seeding ${communityCount} communities with ${pubsPerCommunity} reviewed posts each...`,
  )
  const createdById = seedUuid(0, '01')
  {
    await using transaction = await beginTransaction()
    const query = transaction
    const values: unknown[] = []
    const rows: string[] = []
    for (let i = 0; i < communityCount; i++) {
      const id = seedUuid(i, '14')
      const name = `Seed Community ${i}`
      const slug = `seed-community-${i}`
      values.push(id, name, slug, createdById)
      const base = values.length - 3
      rows.push(`($${base}, $${base + 1}, $${base + 2}, $${base + 3}, 'system')`)
    }
    await query(
      `/* seedExplainData */ INSERT INTO communities (id, name, slug, created_by_id, created_via) VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
      values,
    )

    await transaction.commit()
  }
  {
    await using transaction = await beginTransaction()
    const query = transaction
    const values: unknown[] = []
    const rows: string[] = []
    for (let i = 0; i < communityCount; i++) {
      const communityId = seedUuid(i, '14')
      for (let j = 0; j < 10; j++) {
        const userId = seedUuid(i * 10 + j, '01')
        const role = j === 0 ? 'owner' : j === 1 ? 'moderator' : 'member'
        values.push(communityId, userId, role)
        const base = values.length - 2
        rows.push(`($${base}, $${base + 1}, $${base + 2}::community_member_roles)`)
      }
    }
    await query(
      `/* seedExplainData */ INSERT INTO community_members (community_id, user_id, role)
       VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
      values,
    )

    await transaction.commit()
  }
  const totalPubs = communityCount * pubsPerCommunity
  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let i = 0; i < totalPubs; i += 500) {
      const batch = Math.min(500, totalPubs - i)
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < batch; j++) {
        const idx = i + j
        const communityId = seedUuid(idx % communityCount, '14')
        const postId = seedUuid(idx, '05')
        values.push(communityId, postId, createdById)
        const base = values.length - 2
        rows.push(`($${base}, $${base + 1}, $${base + 2}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
      }
      await query(
        `/* seedExplainData */ INSERT INTO community_post_reviews
           (community_id, post_id, submitted_by_id, reviewed_at, approved_at)
         VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
    }

    await transaction.commit()
  }
}
export async function seedPostDataPointTopics(count = 1000, postTypeCount = count): Promise<void> {
  console.log(`Seeding ${count} post data point topic relations...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let i = 0; i < count; i += 1000) {
      const batch = Math.min(1000, count - i)
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < batch; j++) {
        const idx = i + j
        const postId = seedUuid((idx % postTypeCount) * 3 + 2, '05')
        const topicId = seedUuid((idx + Math.floor(idx / postTypeCount)) % 2500, '04')
        values.push(postId, topicId)
        const base = values.length - 1
        rows.push(`($${base}, $${base + 1}, 0)`)
      }
      await query(
        `/* seedExplainData */ INSERT INTO post_data_point_topics (post_id, topic_id, order_index)
         VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
    }

    await transaction.commit()
  }
}
export async function seedPostReviewTopicRatings(
  count = 1000,
  postTypeCount = count,
): Promise<void> {
  console.log(`Seeding ${count} post review topic ratings...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let i = 0; i < count; i += 1000) {
      const batch = Math.min(1000, count - i)
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < batch; j++) {
        const idx = i + j
        const postId = seedUuid((idx % postTypeCount) * 3 + 1, '05')
        const topicId = seedUuid((idx + Math.floor(idx / postTypeCount)) % 2500, '04')
        const rating = (idx % 5) + 1 // 1-5 distribution
        values.push(postId, topicId, rating)
        const base = values.length - 2
        rows.push(`($${base}, $${base + 1}, $${base + 2})`)
      }
      await query(
        `/* seedExplainData */ INSERT INTO post_review_topic_ratings (post_id, topic_id, rating)
         VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
    }

    await transaction.commit()
  }
}

// post-child-by-post reads post_review_topic_ratings by post_id for the anchor seed post (index
// 0), but seedPostReviewTopicRatings only ever rates post indices congruent to 1 mod 3 — index 0
// is never covered. Add one dedicated rating for it.
export async function seedAnchorPostReviewTopicRating(): Promise<void> {
  console.log('Seeding a post review topic rating for the anchor seed post...')
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(
      `/* seedExplainData */ INSERT INTO post_review_topic_ratings (post_id, topic_id, rating)
       VALUES ($1, $2, 5) ON CONFLICT DO NOTHING`,
      [seedUuid(0, '05'), seedUuid(0, '04')],
    )

    await transaction.commit()
  }
}

// search-communities-has-list-items needs a real community_list_items__topics row so the
// hasListItems filter has a non-empty result set to return.
export async function seedCommunityListItemTopic(): Promise<void> {
  console.log('Seeding a community list item (topic) for community 0...')
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(
      `/* seedExplainData */ INSERT INTO community_list_items__topics (community_id, topic_id, added_by_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [seedUuid(0, '14'), seedUuid(0, '04'), seedUuid(0, '01')],
    )

    await transaction.commit()
  }
}

// search-community-posts / search-pending-community-posts both additionally require
// posts.community_id to match, but seedPosts never sets it (only community_post_reviews carries
// community_id). seedCommunities' bulk insert already gives post indices 5 and 10 an approved
// community_post_reviews row for community 0 (idx % communityCount === 0) — set their
// posts.community_id to match, then flip index 10's review back to pending.
export async function seedCommunityPosts(): Promise<void> {
  console.log('Seeding approved and pending posts for community 0...')
  const communityId = seedUuid(0, '14')
  const approvedPostId = seedUuid(5, '05')
  const pendingPostId = seedUuid(10, '05')
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(
      `/* seedExplainData */ UPDATE posts SET community_id = $1 WHERE id = ANY($2::uuid[])`,
      [communityId, [approvedPostId, pendingPostId]],
    )
    await query(
      `/* seedExplainData */ UPDATE community_post_reviews SET approved_at = NULL
       WHERE community_id = $1 AND post_id = $2`,
      [communityId, pendingPostId],
    )

    await transaction.commit()
  }
}
