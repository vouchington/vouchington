import { createAsyncGeneratorFromCursor, read } from '@data-stores/psql'
import { normalizeKey } from '@ts-shared/utils/strings'
import { entityCacheBloomFilters } from './bloom-filter-instances.mts'

const BATCH_SIZE = 5000

export async function backfillPostsBloomFilter(): Promise<void> {
  const { posts } = entityCacheBloomFilters
  const [{ rows: r1 }, { rows: r2 }] = await Promise.all([
    read(
      '/* backfillPostsBloomFilter */ SELECT COUNT(*)::int AS count FROM posts WHERE deleted_at IS NULL',
      [],
    ),
    read('/* backfillPostsBloomFilter */ SELECT COUNT(*)::int AS count FROM post_slugs', []),
  ])
  const count = (r1[0]?.count ?? 0) + (r2[0]?.count ?? 0)
  const capacity = Math.max(posts.getConfig().capacity, 2 * count)
  await posts.rebuildFromStream(inBatches(postKeysFromDb()), capacity)
}

async function* postKeysFromDb(): AsyncGenerator<string> {
  for await (const { id } of createAsyncGeneratorFromCursor<{ id: string }>(
    '/* postKeysFromDb */ SELECT id FROM posts WHERE deleted_at IS NULL',
    { batchSize: BATCH_SIZE },
  ))
    yield normalizeKey(id)
  for await (const { slug } of createAsyncGeneratorFromCursor<{ slug: string }>(
    '/* postKeysFromDb */ SELECT slug FROM post_slugs',
    { batchSize: BATCH_SIZE },
  ))
    yield normalizeKey(slug)
}

export async function backfillTopicsBloomFilter(): Promise<void> {
  const { topics } = entityCacheBloomFilters
  const [{ rows: r1 }, { rows: r2 }, { rows: r3 }] = await Promise.all([
    read(
      '/* backfillTopicsBloomFilter */ SELECT COUNT(*)::int AS count FROM topics WHERE deleted_at IS NULL AND merged_into_topic_id IS NULL',
      [],
    ),
    read('/* backfillTopicsBloomFilter */ SELECT COUNT(*)::int AS count FROM topic_aliases', []),
    read(
      `/* backfillTopicsBloomFilter */
      -- no-mistakes-disable-next-line postgres-required-predicates: merged source topic UUIDs must stay in the bloom filter for redirect lookups
      SELECT COUNT(*)::int AS count
      FROM topics source_topic
      JOIN topics destination_topic ON destination_topic.id = source_topic.merged_into_topic_id
      WHERE source_topic.deleted_at IS NULL
        AND source_topic.merged_into_topic_id IS NOT NULL
        AND destination_topic.deleted_at IS NULL
        AND destination_topic.merged_into_topic_id IS NULL`,
      [],
    ),
  ])
  const count = (r1[0]?.count ?? 0) * 2 + (r2[0]?.count ?? 0) + (r3[0]?.count ?? 0)
  const capacity = Math.max(topics.getConfig().capacity, 2 * count)
  await topics.rebuildFromStream(inBatches(topicsKeysFromDb()), capacity)
}

async function* topicsKeysFromDb(): AsyncGenerator<string> {
  for await (const { id, slug } of createAsyncGeneratorFromCursor<{ id: string; slug: string }>(
    '/* topicsKeysFromDb */ SELECT id, slug FROM topics WHERE deleted_at IS NULL AND merged_into_topic_id IS NULL',
    { batchSize: BATCH_SIZE },
  )) {
    yield normalizeKey(id)
    yield normalizeKey(slug)
  }
  for await (const { id } of createAsyncGeneratorFromCursor<{ id: string }>(
    `/* topicsKeysFromDb */
    -- no-mistakes-disable-next-line postgres-required-predicates: merged source topic UUIDs must stay in the bloom filter for redirect lookups
    SELECT source_topic.id
    FROM topics source_topic
    JOIN topics destination_topic ON destination_topic.id = source_topic.merged_into_topic_id
    WHERE source_topic.deleted_at IS NULL
      AND source_topic.merged_into_topic_id IS NOT NULL
      AND destination_topic.deleted_at IS NULL
      AND destination_topic.merged_into_topic_id IS NULL`,
    { batchSize: BATCH_SIZE },
  ))
    yield normalizeKey(id)
  for await (const { alias } of createAsyncGeneratorFromCursor<{ alias: string }>(
    '/* topicsKeysFromDb */ SELECT alias FROM topic_aliases',
    { batchSize: BATCH_SIZE },
  ))
    yield normalizeKey(alias)
}

export async function backfillUsersBloomFilter(): Promise<void> {
  const { users } = entityCacheBloomFilters
  const { rows } = await read(
    '/* backfillUsersBloomFilter */ SELECT COUNT(*)::int AS count FROM users WHERE deleted_at IS NULL',
    [],
  )
  const count = (rows[0]?.count ?? 0) * 2 // id + username per user
  const capacity = Math.max(users.getConfig().capacity, 2 * count)
  await users.rebuildFromStream(inBatches(usersKeysFromDb()), capacity)
}

async function* usersKeysFromDb(): AsyncGenerator<string> {
  for await (const { id, username } of createAsyncGeneratorFromCursor<{
    id: string
    username: string
  }>('/* usersKeysFromDb */ SELECT id, username FROM users WHERE deleted_at IS NULL', {
    batchSize: BATCH_SIZE,
  })) {
    yield normalizeKey(id)
    if (username) yield normalizeKey(username)
  }
}

export async function backfillCommunitiesBloomFilter(): Promise<void> {
  const { communities } = entityCacheBloomFilters
  const { rows } = await read(
    '/* backfillCommunitiesBloomFilter */ SELECT COUNT(*)::int AS count FROM communities WHERE deleted_at IS NULL',
    [],
  )
  const count = (rows[0]?.count ?? 0) * 2 // id + slug per community
  const capacity = Math.max(communities.getConfig().capacity, 2 * count)
  await communities.rebuildFromStream(inBatches(communitiesKeysFromDb()), capacity)
}

async function* communitiesKeysFromDb(): AsyncGenerator<string> {
  for await (const { id, slug } of createAsyncGeneratorFromCursor<{ id: string; slug: string }>(
    '/* communitiesKeysFromDb */ SELECT id, slug FROM communities WHERE deleted_at IS NULL',
    { batchSize: BATCH_SIZE },
  )) {
    yield normalizeKey(id)
    yield normalizeKey(slug)
  }
}

export async function backfillRssFeedItemsBloomFilter(): Promise<void> {
  const { rss_feed_items } = entityCacheBloomFilters
  const { rows } = await read(
    '/* backfillRssFeedItemsBloomFilter */ SELECT COUNT(*)::int AS count FROM rss_feed_items WHERE deleted_at IS NULL',
    [],
  )
  const count = rows[0]?.count ?? 0
  const capacity = Math.max(rss_feed_items.getConfig().capacity, 2 * count)
  await rss_feed_items.rebuildFromStream(inBatches(rssFeedItemsKeysFromDb()), capacity)
}

async function* rssFeedItemsKeysFromDb(): AsyncGenerator<string> {
  for await (const { id } of createAsyncGeneratorFromCursor<{
    id: string
  }>('/* rssFeedItemsKeysFromDb */ SELECT id FROM rss_feed_items WHERE deleted_at IS NULL', {
    batchSize: BATCH_SIZE,
  }))
    yield normalizeKey(id)
}

// Groups individual keys into fixed-size batches for bloom filter population via rebuildFromStream.
async function* inBatches(keys: AsyncIterable<string>): AsyncGenerator<string[]> {
  const batch: string[] = []
  for await (const key of keys) {
    batch.push(key)
    if (batch.length >= BATCH_SIZE) yield batch.splice(0, BATCH_SIZE)
  }
  if (batch.length > 0) yield batch
}
