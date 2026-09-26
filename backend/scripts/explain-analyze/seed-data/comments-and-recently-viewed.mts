import { beginTransaction } from '@data-stores/psql'
import { upsertRecentlyViewed } from '@services/recently-viewed'
import { commentSeedTimestampMs, contentHash, seedUuid, seedUuidAtTimestamp } from './common.mts'

export async function seedComments(): Promise<void> {
  console.log('Seeding comment tree (3 levels, 20 comments total)...')
  const rootPostId = seedUuid(0, '05')
  const userId = seedUuid(0, '01')
  const hash = contentHash('comment-seed')
  const l1TimestampMs = commentSeedTimestampMs(0, 1)
  const l2TimestampMs = commentSeedTimestampMs(0, 2)
  const l3TimestampMs = commentSeedTimestampMs(0, 3)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    const l1Values: unknown[] = []
    const l1Rows: string[] = []
    for (let i = 0; i < 5; i++) {
      const id = seedUuidAtTimestamp(l1TimestampMs, i)
      const markdown = `Seed comment L1-${i}`
      l1Values.push(id, userId, markdown, rootPostId, rootPostId, hash, hash)
      const base = l1Values.length - 6
      l1Rows.push(
        `($${base}, 'comment'::post_types, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, 'system')`,
      )
    }
    await query(
      `/* seedExplainData */ INSERT INTO posts (
        id, post_type, created_by_id, markdown, parent_id, root_id,
        bedrock_nova_multimodal_v1_content_sha256,
        llm_moderation_content_sha256,
        created_via
      ) VALUES ${l1Rows.join(', ')} ON CONFLICT DO NOTHING`,
      l1Values,
    )
    const l2Values: unknown[] = []
    const l2Rows: string[] = []
    for (let i = 0; i < 5; i++) {
      const id = seedUuidAtTimestamp(l2TimestampMs, i)
      const parentId = seedUuidAtTimestamp(l1TimestampMs, i)
      const markdown = `Seed comment L2-${i}`
      l2Values.push(id, userId, markdown, parentId, rootPostId, hash, hash)
      const base = l2Values.length - 6
      l2Rows.push(
        `($${base}, 'comment'::post_types, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, 'system')`,
      )
    }
    await query(
      `/* seedExplainData */ INSERT INTO posts (
        id, post_type, created_by_id, markdown, parent_id, root_id,
        bedrock_nova_multimodal_v1_content_sha256,
        llm_moderation_content_sha256,
        created_via
      ) VALUES ${l2Rows.join(', ')} ON CONFLICT DO NOTHING`,
      l2Values,
    )
    const l3Values: unknown[] = []
    const l3Rows: string[] = []
    for (let i = 0; i < 10; i++) {
      const id = seedUuidAtTimestamp(l3TimestampMs, i)
      const parentId = seedUuidAtTimestamp(l2TimestampMs, i % 5)
      const markdown = `Seed comment L3-${i}`
      l3Values.push(id, userId, markdown, parentId, rootPostId, hash, hash)
      const base = l3Values.length - 6
      l3Rows.push(
        `($${base}, 'comment'::post_types, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, 'system')`,
      )
    }
    await query(
      `/* seedExplainData */ INSERT INTO posts (
        id, post_type, created_by_id, markdown, parent_id, root_id,
        bedrock_nova_multimodal_v1_content_sha256,
        llm_moderation_content_sha256,
        created_via
      ) VALUES ${l3Rows.join(', ')} ON CONFLICT DO NOTHING`,
      l3Values,
    )

    await transaction.commit()
  }
}
const SEED_SESSION_ID = seedUuid(0, '11') // 019e0000-1100-7000-8000-000000000000
export async function seedRecentlyViewedEntities(
  entityType: 'post' | 'topic',
  getEntityId: (i: number) => string,
  count = 100,
): Promise<void> {
  console.log(`Seeding ${count} recently viewed ${entityType}s...`)
  const sessionId = SEED_SESSION_ID
  const userId = seedUuid(0, '01')
  for (let i = 0; i < count; i++) {
    const entityId = getEntityId(i)
    await upsertRecentlyViewed(entityType, entityId, sessionId, userId)
  }
}
export async function seedRecentlyViewedPosts(count = 100): Promise<void> {
  await seedRecentlyViewedEntities('post', i => seedUuid(i % 500, '05'), count)
}
export async function seedRecentlyViewedTopics(count = 100): Promise<void> {
  await seedRecentlyViewedEntities('topic', i => seedUuid(i % 500, '04'), count)
}
