import { beginTransaction } from '@data-stores/psql'
import {
  contentHash,
  FEED_URL_COUNT,
  HOSTNAME_COUNT,
  ITEM_URL_POOL,
  SEED_PREFIX,
  seedUuid,
} from './common.mts'

export async function seedRssFeeds(feedCount = 500, itemCount = 5000): Promise<void> {
  console.log(`Seeding ${feedCount} RSS feeds and ${itemCount} items...`)
  await using feedsTransaction = await beginTransaction()
  const values: unknown[] = []
  const rows: string[] = []
  for (let i = 0; i < feedCount; i++) {
    const id = seedUuid(i, '08')
    const urlId = seedUuid(i, '03') // 1:1 url per feed (unique constraint)
    const topicId = seedUuid(i, '04') // 1:1 topic per feed (unique constraint)
    const title = `Seed Feed ${i}`
    values.push(id, urlId, topicId, title)
    const base = values.length - 3
    rows.push(`($${base}, $${base + 1}, $${base + 2}, $${base + 3}, 'system')`)
  }
  await feedsTransaction(
    `/* seedExplainData */ INSERT INTO rss_feeds (id, rss_feed_url_id, topic_id, title, created_via)
       VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
    values,
  )
  await feedsTransaction(
    `/* seedExplainData */ INSERT INTO rss_feed_enablement_changes (rss_feed_id, enabled, reason) SELECT id, TRUE, 'explain seed initial state' FROM rss_feeds WHERE NOT EXISTS ( SELECT 1 FROM rss_feed_enablement_changes c WHERE c.rss_feed_id = rss_feeds.id )`,
  )
  await feedsTransaction(
    `/* seedExplainData */ INSERT INTO rss_feed_discoverability_changes (rss_feed_id, enabled, reason) SELECT id, TRUE, 'explain seed initial state' FROM rss_feeds WHERE NOT EXISTS ( SELECT 1 FROM rss_feed_discoverability_changes c WHERE c.rss_feed_id = rss_feeds.id )`,
  )
  await feedsTransaction.commit()
  await using itemsTransaction = await beginTransaction()
  for (let i = 0; i < itemCount; i += 500) {
    const batch = Math.min(500, itemCount - i)
    const identityValues: unknown[] = []
    const identityRows: string[] = []
    const itemValues: unknown[] = []
    const itemRows: string[] = []
    for (let j = 0; j < batch; j++) {
      const idx = i + j
      const feedIdx = idx % feedCount
      const hostnameId = seedUuid(feedIdx % HOSTNAME_COUNT, '02') // feed's URL hostname
      const guid = `seed-item-guid-${idx}`
      const urlId = seedUuid(FEED_URL_COUNT + (idx % ITEM_URL_POOL), '03') // shared item URL pool
      const isoDate = new Date(Date.now() - idx * 60_000).toISOString()
      const data = JSON.stringify({
        title: `Seed Item ${idx}`,
        link: `https://example.com/${idx}`,
        isoDate,
      })
      const hash = contentHash(`rss-item-${idx}`)
      identityValues.push(hostnameId, guid)
      const identityBase = identityValues.length - 1
      identityRows.push(`($${identityBase}, $${identityBase + 1})`)
      itemValues.push(hostnameId, guid, urlId, data, hash)
      const itemBase = itemValues.length - 4
      itemRows.push(
        `($${itemBase}::uuid, $${itemBase + 1}::text, $${itemBase + 2}::uuid, $${itemBase + 3}::jsonb, $${itemBase + 4}::bytea)`,
      )
    }
    await itemsTransaction(
      `/* seedExplainData */ INSERT INTO rss_feed_item_ids (url_hostname_id, guid)
         VALUES ${identityRows.join(', ')} ON CONFLICT (url_hostname_id, guid) DO NOTHING`,
      identityValues,
    )
    await itemsTransaction(
      `/* seedExplainData */ INSERT INTO rss_feed_items
           (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256)
         SELECT ids.id, seeded.url_id, seeded.data, seeded.content_sha256
         FROM (VALUES ${itemRows.join(', ')})
           AS seeded(url_hostname_id, guid, url_id, data, content_sha256)
         JOIN rss_feed_item_ids ids
           ON ids.url_hostname_id = seeded.url_hostname_id AND ids.guid = seeded.guid
         ON CONFLICT (id) DO NOTHING`,
      itemValues,
    )
  }

  await itemsTransaction.commit()
  await using sourcesTransaction = await beginTransaction()
  await sourcesTransaction(
    `/* seedExplainData */ INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at) SELECT rf.id, ids.id, items.published_at FROM rss_feed_item_ids ids LEFT JOIN rss_feed_items items ON items.id = ids.id JOIN rss_feeds rf ON rf.rss_feed_url_id IN (SELECT id FROM urls WHERE hostname_id = ids.url_hostname_id) WHERE ids.guid LIKE 'seed-item-guid-%' ON CONFLICT DO NOTHING`,
  )

  await sourcesTransaction.commit()
}

export async function seedRssFeedItemCategories(count = 5000): Promise<void> {
  console.log(`Seeding ${count} RSS feed item categories...`)
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedExplainData */ INSERT INTO rss_feed_item_categories (rss_feed_item_id, category_text, topic_id) SELECT seeded.id, 'seed-category-' || (seeded.row_index % 200), topic.topic_id FROM ( SELECT id, (row_number() OVER (ORDER BY id) - 1)::int AS row_index FROM rss_feed_item_ids WHERE guid LIKE 'seed-item-guid-%' LIMIT $1 ) seeded CROSS JOIN LATERAL ( SELECT ($2 || lpad(to_hex(seeded.row_index % 200), 12, '0'))::uuid AS topic_id ) topic ON CONFLICT DO NOTHING`,
    [count, `${SEED_PREFIX}-0400-7000-8000-`],
  )

  await transaction.commit()
}
export async function seedFollowRssFeedRelations(count = 500): Promise<void> {
  console.log(`Seeding ${count} follow RSS feed relations...`)
  await using transaction = await beginTransaction()
  const values: unknown[] = []
  const rows: string[] = []
  for (let i = 0; i < count; i++) {
    const subjectId = seedUuid(i % 20_000, '01') // user
    const objectId = seedUuid(i % 2500, '08') // rss_feed
    const userId = subjectId
    values.push(subjectId, objectId, userId)
    const base = values.length - 2
    rows.push(`($${base}, $${base + 1}, $${base + 2})`)
  }
  if (rows.length > 0) {
    await transaction(
      `/* seedExplainData */ INSERT INTO relation__user__follow__rss_feed (subject_id, object_id, created_by_id)
         VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
      values,
    )
  }

  await transaction.commit()
}
export async function seedFollowTopicRelations(count = 500): Promise<void> {
  console.log(`Seeding ${count} follow topic relations...`)
  await using transaction = await beginTransaction()
  const values: unknown[] = []
  const rows: string[] = []
  for (let i = 0; i < count; i++) {
    const subjectId = seedUuid(i % 20_000, '01') // user
    const objectId = seedUuid(i % 2500, '04') // topic
    const userId = subjectId
    values.push(subjectId, objectId, userId)
    const base = values.length - 2
    rows.push(`($${base}, $${base + 1}, $${base + 2})`)
  }
  if (rows.length > 0) {
    await transaction(
      `/* seedExplainData */ INSERT INTO relation__user__follow__topic (subject_id, object_id, created_by_id)
         VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
      values,
    )
  }

  await transaction.commit()
}
export async function seedHeavyFollowRelations(): Promise<void> {
  const powerUserId = seedUuid(1, '01')
  console.log('Seeding heavy-follow relations for power user (seeduser1)...')
  await using userTransaction = await beginTransaction()
  const userValues: unknown[] = []
  const userRows: string[] = []
  for (let i = 2; i <= 1001; i++) {
    const objectId = seedUuid(i, '01')
    userValues.push(powerUserId, objectId, powerUserId)
    const base = userValues.length - 2
    userRows.push(`($${base}, $${base + 1}, $${base + 2})`)
  }
  await userTransaction(
    `/* seedExplainData */ INSERT INTO relation__user__follow__user (subject_id, object_id, created_by_id)
       VALUES ${userRows.join(', ')} ON CONFLICT DO NOTHING`,
    userValues,
  )

  await userTransaction.commit()
  await using topicTransaction = await beginTransaction()
  const topicValues: unknown[] = []
  const topicRows: string[] = []
  for (let i = 0; i < 200; i++) {
    const objectId = seedUuid(i, '04')
    topicValues.push(powerUserId, objectId, powerUserId)
    const base = topicValues.length - 2
    topicRows.push(`($${base}, $${base + 1}, $${base + 2})`)
  }
  await topicTransaction(
    `/* seedExplainData */ INSERT INTO relation__user__follow__topic (subject_id, object_id, created_by_id)
       VALUES ${topicRows.join(', ')} ON CONFLICT DO NOTHING`,
    topicValues,
  )

  await topicTransaction.commit()
  await using rssFeedTransaction = await beginTransaction()
  const rssFeedValues: unknown[] = []
  const rssFeedRows: string[] = []
  for (let i = 0; i < 200; i++) {
    const objectId = seedUuid(i, '08')
    rssFeedValues.push(powerUserId, objectId, powerUserId)
    const base = rssFeedValues.length - 2
    rssFeedRows.push(`($${base}, $${base + 1}, $${base + 2})`)
  }
  await rssFeedTransaction(
    `/* seedExplainData */ INSERT INTO relation__user__follow__rss_feed (subject_id, object_id, created_by_id)
       VALUES ${rssFeedRows.join(', ')} ON CONFLICT DO NOTHING`,
    rssFeedValues,
  )

  await rssFeedTransaction.commit()
}
