import { beginTransaction } from '@data-stores/psql'
import { contentHash, crawlSeedUuid, HOSTNAME_COUNT, seedUuid } from './common.mts'

export async function seedCrawls(count = 100): Promise<void> {
  console.log(`Seeding ${count} crawls...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let i = 0; i < count; i += 500) {
      const batch = Math.min(500, count - i)
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < batch; j++) {
        const idx = i + j
        const id = crawlSeedUuid(idx, '12')
        const urlId = seedUuid(idx % HOSTNAME_COUNT, '03')
        const markdown = `Seed crawl content for url ${idx % HOSTNAME_COUNT}`
        values.push(id, urlId, markdown, 200)
        const base = values.length - 3
        rows.push(
          `($${base}, $${base + 1}, $${base + 2}, $${base + 3}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        )
      }
      await query(
        `/* seedExplainData */ INSERT INTO crawls (id, url_id, markdown, response_status_code, completed_at, embeddings_generated_at)
         VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
    }

    await transaction.commit()
  }
}
export async function seedCrawlChunks(count = 300): Promise<void> {
  console.log(`Seeding ${count} crawl chunks...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (let i = 0; i < count; i += 500) {
      const batch = Math.min(500, count - i)
      const values: unknown[] = []
      const rows: string[] = []
      for (let j = 0; j < batch; j++) {
        const idx = i + j
        const crawlId = crawlSeedUuid(Math.floor(idx / 3), '12')
        const orderIndex = idx % 3
        const markdown = `Seed chunk ${orderIndex} for crawl ${Math.floor(idx / 3)}`
        const hash = contentHash(`crawl-chunk-${idx}`)
        values.push(crawlId, orderIndex, markdown, hash)
        const base = values.length - 3
        rows.push(`($${base}, $${base + 1}, $${base + 2}, $${base + 3})`)
      }
      await query(
        `/* seedExplainData */ INSERT INTO crawl_chunks (crawl_id, order_index, markdown, bedrock_nova_multimodal_v1_content_sha256)
         VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        values,
      )
    }

    await transaction.commit()
  }
}
export async function seedPostSlugs(count = 100): Promise<void> {
  console.log(`Seeding ${count} post slugs...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    const values: unknown[] = []
    const rows: string[] = []
    for (let i = 0; i < count; i++) {
      const postId = seedUuid(i, '05')
      const slug = `seed-post-${i}`
      values.push(postId, slug)
      const base = values.length - 1
      rows.push(`($${base}, $${base + 1})`)
    }
    await query(
      `/* seedExplainData */ INSERT INTO post_slugs (post_id, slug) VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
      values,
    )

    await transaction.commit()
  }
}
