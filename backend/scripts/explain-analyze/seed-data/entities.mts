import { beginTransaction } from '@data-stores/psql'
import { contentHash, FEED_URL_COUNT, HOSTNAME_COUNT, ITEM_URL_POOL, seedUuid } from './common.mts'

export { seedUserRemovedPlatformPosts } from './user-removed-platform-posts.mts'

export async function seedUsers(count = 2000): Promise<void> {
  console.log(`Seeding ${count} users...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let i = 0; i < count; i += 500) {
      const batch = Math.min(500, count - i)
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < batch; j++) {
        const idx = i + j
        const id = seedUuid(idx, '01')
        const username = `seeduser${idx}`
        values.push(id, username)
        const base = values.length - 1
        rows.push(`($${base}, $${base + 1})`)
      }
      await query(
        `/* seedExplainData */ INSERT INTO users (id, username) VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
    }

    await transaction.commit()
  }
}
export async function seedHostnames(count = HOSTNAME_COUNT): Promise<void> {
  console.log(`Seeding ${count} hostnames...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    const values: unknown[] = []
    const rows: string[] = []
    for (let i = 0; i < count; i++) {
      const id = seedUuid(i, '02')
      const hostname = `seed-host-${i}.example.com`
      values.push(id, hostname)
      const base = values.length - 1
      rows.push(`($${base}, $${base + 1})`)
    }
    await query(
      `/* seedExplainData */ INSERT INTO url_hostnames (id, hostname) VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
      values,
    )

    await transaction.commit()
  }
}
export async function seedUrls(count = FEED_URL_COUNT + ITEM_URL_POOL): Promise<void> {
  console.log(`Seeding ${count} URLs...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let i = 0; i < count; i += 500) {
      const batch = Math.min(500, count - i)
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < batch; j++) {
        const idx = i + j
        const id = seedUuid(idx, '03')
        const hostnameId = seedUuid(idx % HOSTNAME_COUNT, '02')
        const url = `https://seed-host-${idx % HOSTNAME_COUNT}.example.com/feed/${idx}`
        values.push(id, url, hostnameId, `{}`)
        const base = values.length - 3
        rows.push(`($${base}, $${base + 1}, $${base + 2}, $${base + 3}::jsonb)`)
      }
      await query(
        `/* seedExplainData */ INSERT INTO urls (id, url, hostname_id, search_params) VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
    }

    await transaction.commit()
  }
}
export async function seedTopics(count = 100): Promise<void> {
  console.log(`Seeding ${count} topics...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    const values: unknown[] = []
    const rows: string[] = []
    for (let i = 0; i < count; i++) {
      const id = seedUuid(i, '04')
      const name = `Seed Topic ${i}`
      const slug = `seed-topic-${i}`
      const hash = contentHash(`topic-${i}`)
      values.push(id, name, slug, hash)
      const base = values.length - 3
      rows.push(`($${base}, $${base + 1}, $${base + 2}, $${base + 3})`)
    }
    await query(
      `/* seedExplainData */ INSERT INTO topics (id, name, slug, bedrock_nova_multimodal_v1_content_sha256)
       VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
      values,
    )

    await transaction.commit()
  }
}

export async function seedTopicParentRelations(count = 500): Promise<void> {
  console.log(`Seeding ${count} topic parent relations...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    const values: unknown[] = []
    const rows: string[] = []
    for (let i = 0; i < count; i++) {
      const childId = seedUuid(i, '04')
      const parentId = seedUuid(count + (i % count), '04')
      const userId = seedUuid(i % 20_000, '01')
      values.push(childId, parentId, userId)
      const base = values.length - 2
      rows.push(`($${base}, $${base + 1}, $${base + 2})`)
    }
    await query(
      `/* seedExplainData */ INSERT INTO relation__topic__parent__topic (subject_id, object_id, created_by_id)
       VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
      values,
    )

    await transaction.commit()
  }
}
export async function seedPosts(count = 10_000): Promise<void> {
  console.log(`Seeding ${count} posts...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let i = 0; i < count; i += 500) {
      const batch = Math.min(500, count - i)
      const values: unknown[] = []
      const rows: string[] = []
      const postIds: string[] = []
      for (let j = 0; j < batch; j++) {
        const idx = i + j
        const id = seedUuid(idx, '05')
        const userId = seedUuid(idx % 20_000, '01')
        const postType = idx % 3 === 0 ? 'discussion' : idx % 3 === 1 ? 'review' : 'data_point'
        const title = `Seed Post ${idx}`
        const markdown = `Content for seed post ${idx}`
        const hash = contentHash(`post-${idx}`)
        const isDataPoint = postType === 'data_point'
        const dataPointVertical = isDataPoint ? 'credit_card' : null
        const structuredData = isDataPoint
          ? JSON.stringify({
              result: idx % 2 === 0 ? 'approved' : 'denied',
              credit_score_range: ['300-579', '580-669', '670-739', '740-799', '800-850'][idx % 5],
            })
          : null
        postIds.push(id)
        values.push(
          id,
          postType,
          title,
          markdown,
          userId,
          hash,
          hash,
          hash,
          dataPointVertical,
          structuredData,
        )
        const base = values.length - 9
        rows.push(
          `($${base}, $${base + 1}::post_types, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}::jsonb)`,
        )
      }
      await query(
        `/* seedExplainData */ INSERT INTO posts (
          id, post_type, title, markdown, created_by_id,
          bedrock_nova_multimodal_v1_content_sha256,
          openai_omni_moderation_content_sha256,
          llm_moderation_content_sha256,
          data_point_vertical, structured_data
        ) VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
      await query(
        `/* seedExplainData */ WITH seed_posts AS ( SELECT UNNEST($1::uuid[]) AS post_id ), inserted_change AS ( INSERT INTO post_clearance_changes (post_id, change_type, metadata) SELECT seed_posts.post_id, 'approve', '{"source":"explain-seed"}'::jsonb FROM seed_posts JOIN posts ON posts.id = seed_posts.post_id WHERE posts.approved_at IS NULL AND posts.rejected_at IS NULL AND posts.in_review_at IS NULL RETURNING id, post_id, created_at ) UPDATE posts SET latest_clearance_change_id = inserted_change.id, approved_at = inserted_change.created_at, rejected_at = NULL, in_review_at = NULL FROM inserted_change WHERE posts.id = inserted_change.post_id`,
        [postIds],
      )
    }

    await transaction.commit()
  }
}
