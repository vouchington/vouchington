import { beginTransaction, write } from '@data-stores/psql'
import { SEED_PREFIX, seedUuid } from './common.mts'

export async function seedVotes(postVoteCount = 2000, topicVoteCount = 500): Promise<void> {
  console.log(`Seeding ${postVoteCount} post votes and ${topicVoteCount} topic votes...`)
  // Posts moved off the fixed SEED_PREFIX instant onto per-day real-clock timestamps (see
  // seed-data/common.mts), so they can no longer be located by a LIKE pattern on the id prefix —
  // compute the ids directly instead, same as feed-and-metrics.mts's post-votes-by-user scenario.
  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let i = 0; i < postVoteCount; i += 500) {
      const batch = Math.min(500, postVoteCount - i)
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < batch; j++) {
        const idx = i + j
        const postId = seedUuid(idx, '05')
        const userId = seedUuid(idx % 20_000, '01')
        const score = idx % 5 === 0 ? -1 : 1
        values.push(postId, userId, score)
        const base = values.length - 2
        rows.push(`($${base}, $${base + 1}, $${base + 2})`)
      }
      await query(
        `/* seedExplainData */ INSERT INTO post_votes (post_id, user_id, score) VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
    }

    await transaction.commit()
  }
  // Fixture-critical post: idx 0 (seedPostId) gets a lone score=-1 vote from the bulk loop above
  // (idx % 5 === 0), which would leave its recomputed votes_score_net negative. trending-posts and
  // trending-posts-by-topic need a real positive net on this exact post, so add two more votes from
  // other already-seeded users to push the net positive once aggregated.
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(
      `/* seedExplainData */ INSERT INTO post_votes (post_id, user_id, score) VALUES ($1, $2, 1), ($1, $3, 1) ON CONFLICT DO NOTHING`,
      [seedUuid(0, '05'), seedUuid(1, '01'), seedUuid(2, '01')],
    )

    await transaction.commit()
  }
  const topicRows = await write<{ id: string }>(
    `/* seedVotes topics */ SELECT id FROM topics WHERE id::text LIKE $1 LIMIT 2500`,
    [`${SEED_PREFIX}-04%`],
  )
  const topicIds = topicRows.rows.map(r => r.id)
  if (topicIds.length > 0) {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let i = 0; i < topicVoteCount; i += 500) {
      const batch = Math.min(500, topicVoteCount - i)
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < batch; j++) {
        const idx = i + j
        const topicId = topicIds[idx % topicIds.length]
        const userId = seedUuid(idx % 20_000, '01')
        values.push(topicId, userId, 1)
        const base = values.length - 2
        rows.push(`($${base}, $${base + 1}, $${base + 2})`)
      }
      await query(
        `/* seedExplainData */ INSERT INTO topic_votes (topic_id, user_id, score) VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
    }

    await transaction.commit()
  }
}
export async function seedProfileLinks(userCount = 1000): Promise<void> {
  console.log(`Seeding profile links for ${userCount} users...`)
  const linkTypes = ['twitter', 'github', 'linkedin'] as const
  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let i = 0; i < userCount; i += 500) {
      const batch = Math.min(500, userCount - i)
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < batch; j++) {
        const idx = i + j
        const userId = seedUuid(idx, '01')
        linkTypes.forEach((linkType, order) => {
          const id = seedUuid(idx * linkTypes.length + order, '15')
          values.push(id, userId, linkType, order, `seeduser${idx}-${linkType}`)
          const base = values.length - 4
          rows.push(
            `($${base}, $${base + 1}, $${base + 2}::user_profile_link_types, $${base + 3}, $${base + 4})`,
          )
        })
      }
      await query(
        `/* seedExplainData */ INSERT INTO user_profile_links (id, user_id, link_type, sort_order, handle) VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
    }

    await transaction.commit()
  }
}
export async function seedTopicAliases(count = 2500): Promise<void> {
  console.log(`Seeding ${count} topic aliases...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let i = 0; i < count; i += 1000) {
      const batch = Math.min(1000, count - i)
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < batch; j++) {
        const idx = i + j
        const topicId = seedUuid(idx % 2500, '04')
        const alias = `seed-alias-${idx}`
        values.push(topicId, alias)
        const base = values.length - 1
        rows.push(`($${base}, $${base + 1})`)
      }
      await query(
        `/* seedExplainData */ INSERT INTO topic_aliases (topic_id, alias) VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
    }

    await transaction.commit()
  }
}
