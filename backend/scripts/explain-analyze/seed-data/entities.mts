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
      rows.push(`($${base}, $${base + 1}, $${base + 2}, $${base + 3}, 'system')`)
    }
    await query(
      `/* seedExplainData */ INSERT INTO topics (id, name, slug, bedrock_nova_multimodal_v1_content_sha256, created_via)
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

export { seedPosts } from './posts.mts'
